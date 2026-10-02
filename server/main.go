// Schmeckt's server: sync between the phones of a household and photo recognition, on the home network.
package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"os/user"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

var version = "development" // set by the build

const serviceUser = "schmeckts"

func stateDir() string {
	if d := os.Getenv("STATE_DIRECTORY"); d != "" {
		return strings.Split(d, ":")[0]
	}
	return "/var/lib/schmeckts"
}

func main() {
	log.SetFlags(0) // journald adds the time itself
	dir := stateDir()
	args := os.Args[1:]
	cmd := ""
	if len(args) > 0 {
		cmd, args = args[0], args[1:]
	}
	var err error
	switch cmd {
	case "", "serve":
		err = serve(dir)
	case "setup":
		err = setup(dir, args)
	case "connection":
		err = showConnection(dir)
	case "version":
		fmt.Println(version)
	default:
		err = fmt.Errorf("Unbekannter Befehl %q. Möglich: setup, connection, version", cmd)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func serve(dir string) error {
	store, err := OpenStore(dir)
	if err != nil {
		return fmt.Errorf("Der Ordner %s ist nicht nutzbar: %w", dir, err)
	}
	photos, err := OpenPhotos(dir)
	if err != nil {
		return fmt.Errorf("Der Ordner für die Packungsfotos ist nicht nutzbar: %w", err)
	}
	cfg := NewConfigHolder(dir)
	api := NewAPI(store, cfg, photos)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	var upkeep sync.WaitGroup
	upkeep.Add(1)
	go func() {
		defer upkeep.Done()
		for {
			if err := store.PruneSeen(time.Now()); err != nil {
				log.Printf("pruning change ids failed: %v", err)
			}
			photos.Sweep(store.Varieties())
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Hour):
			}
		}
	}()

	port := cfg.Get().port()
	srv := &http.Server{
		Addr:              ":" + strconv.Itoa(port),
		Handler:           api.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
	srv.RegisterOnShutdown(api.Close)
	epoch, seq := store.Seq()
	log.Printf("Schmeckt’s-Server %s läuft auf Port %d (Abgleich %s, Stand %d)", version, port, epoch, seq)
	if cfg.Get().Code == "" {
		log.Printf("Noch nicht eingerichtet: bitte „Schmeckt’s-Server einrichten“ öffnen")
	}
	failed := make(chan error, 1)
	go func() { failed <- srv.ListenAndServe() }()
	select {
	case err = <-failed: // the port is taken, for instance
	case <-ctx.Done():
		shut, cancel := context.WithTimeout(context.Background(), recognizeTimeout+5*time.Second) // lets a recognition finish
		defer cancel()
		if err := srv.Shutdown(shut); err != nil {
			log.Printf("shutdown: %v", err)
		}
	}
	stop()
	upkeep.Wait()
	if err != nil {
		return err
	}
	log.Printf("server stopped")
	return nil
}

// ownFiles hands files that root created during setup to the service user.
func ownFiles(paths ...string) {
	u, err := user.Lookup(serviceUser)
	if err != nil || os.Geteuid() != 0 {
		return
	}
	uid, _ := strconv.Atoi(u.Uid)
	gid, _ := strconv.Atoi(u.Gid)
	for _, p := range paths {
		os.Chown(p, uid, gid)
	}
}

func requireRoot() error {
	if os.Geteuid() != 0 {
		return errors.New("Dafür werden Administratorrechte gebraucht. Bitte über „Schmeckt’s-Server einrichten“ oder mit sudo starten.")
	}
	return nil
}

func setup(dir string, args []string) error {
	if err := requireRoot(); err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	ownFiles(dir)
	cfg, err := readConfig(dir)
	if err != nil {
		return fmt.Errorf("Die Konfiguration ist beschädigt: %w", err)
	}
	key := ""
	if info, err := os.Stdin.Stat(); err == nil && info.Mode()&os.ModeCharDevice == 0 {
		line, _ := bufio.NewReader(io.LimitReader(os.Stdin, 4096)).ReadString('\n')
		key = strings.TrimSpace(line)
	}
	if key != "" {
		if !strings.HasPrefix(key, "sk-ant-") {
			return errors.New("Das sieht nicht wie ein Anthropic-API-Schlüssel aus. Er beginnt mit „sk-ant-“.")
		}
		test := cfg
		test.APIKey = key
		if err := CheckKey(context.Background(), test); err != nil {
			return err
		}
		cfg.APIKey = key
	}
	newCodeWanted := len(args) > 0 && args[0] == "--new-code"
	if cfg.Code == "" || newCodeWanted {
		cfg.Code = newCode()
	}
	if err := writeConfig(dir, cfg); err != nil {
		return err
	}
	ownFiles(filepath.Join(dir, configFile))
	head := "Fertig eingerichtet."
	if newCodeWanted {
		head = "Neuer Haushaltscode erzeugt. Alle Handys müssen ihn einmal neu eingeben."
	}
	fmt.Println(head + "\n")
	return printConnection(cfg)
}

func showConnection(dir string) error {
	if err := requireRoot(); err != nil {
		return err
	}
	cfg, err := readConfig(dir)
	if err != nil {
		return err
	}
	if cfg.Code == "" {
		return errors.New("Der Server ist noch nicht eingerichtet.")
	}
	return printConnection(cfg)
}

func printConnection(cfg Config) error {
	fmt.Printf("Adresse:  http://%s:%d\n", lanAddress(), cfg.port())
	fmt.Printf("Code:  %s\n\n", cfg.Code)
	fmt.Println("In der App: Einstellungen, „Haushalt“, „Mit Haushalt verbinden“, dann Adresse und Code eintragen.")
	if cfg.APIKey != "" {
		fmt.Println("Foto-Erkennung: eingerichtet")
	} else {
		fmt.Println("Foto-Erkennung: aus, kein API-Schlüssel eingetragen")
	}
	if running(cfg.port()) {
		fmt.Println("Server: läuft")
	} else {
		fmt.Println("Server: läuft gerade nicht")
	}
	return nil
}

func running(port int) bool {
	c := http.Client{Timeout: 2 * time.Second}
	res, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/api/info", port))
	if err != nil {
		return false
	}
	res.Body.Close()
	return res.StatusCode == http.StatusOK
}

func lanAddress() string {
	ifaces, _ := net.Interfaces()
	found := []string{}
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 || virtual(ifc.Name) {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			if ipn, ok := a.(*net.IPNet); ok && ipn.IP.To4() != nil && ipn.IP.IsPrivate() {
				found = append(found, ipn.IP.String())
			}
		}
	}
	sort.SliceStable(found, func(i, j int) bool {
		return strings.HasPrefix(found[i], "192.168.") && !strings.HasPrefix(found[j], "192.168.")
	})
	if len(found) == 0 {
		return "127.0.0.1"
	}
	return found[0]
}

// virtual tells container and VM bridges apart from the network the phones are on.
func virtual(name string) bool {
	for _, p := range []string{"docker", "br-", "virbr", "veth"} {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}
