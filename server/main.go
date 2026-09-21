// Schmeckt's server: shared data and AI recognition for the app on the home network.
//
//	schmeckts-server                     start the server (this is how it runs as a system service)
//	schmeckts-server setup               take the API key from stdin, create a code, show the connection details
//	schmeckts-server setup --new-code    create a new household code as well
//	schmeckts-server connection          show the connection details
//	schmeckts-server overview            show the stored data readably: pets, food, recent meals, devices
//	schmeckts-server restore <backup.json>   bring the stored data back from a backup
//	schmeckts-server version
//
// The data directory is $STATE_DIRECTORY (set by systemd) or /var/lib/schmeckts.
// Everything the commands print is German, like the app.
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
	"os/exec"
	"os/signal"
	"os/user"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
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
	case "overview":
		err = showOverview(dir)
	case "restore":
		err = restore(dir, args)
	case "version":
		fmt.Println(version)
	default:
		err = fmt.Errorf("unbekannter Befehl %q. Möglich: setup, connection, overview, restore, version", cmd)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func serve(dir string) error {
	store, err := OpenStore(dir)
	if err != nil {
		return fmt.Errorf("Datenbestand nicht lesbar: %w", err)
	}
	cfg := NewConfigHolder(dir)
	api := NewAPI(store, cfg, OpenBarcodes(dir))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	go func() { // daily backup, checked once an hour
		for {
			if err := store.Backup(time.Now()); err != nil {
				log.Printf("backup failed: %v", err)
			}
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
		BaseContext:       func(net.Listener) context.Context { return ctx }, // ends live connections on shutdown
	}
	go func() {
		<-ctx.Done()
		shut, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(shut)
	}()
	epoch, seq := store.Seq()
	log.Printf("Schmeckt’s-Server %s läuft auf Port %d (Datenbestand %s, Nummer %d)", version, port, epoch, seq)
	if c := cfg.Get(); c.Code == "" || c.APIKey == "" {
		log.Printf("Noch nicht vollständig eingerichtet: bitte „Schmeckt’s-Server einrichten“ öffnen")
	}
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	log.Printf("server stopped")
	return nil
}

// ownFiles hands the service the files root writes during setup.
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
	if info, _ := os.Stdin.Stat(); info.Mode()&os.ModeCharDevice == 0 {
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

func showOverview(dir string) error {
	if err := requireRoot(); err != nil {
		return err
	}
	st, err := readState(filepath.Join(dir, stateFile))
	if err != nil {
		return fmt.Errorf("Der Datenbestand ist nicht lesbar: %w", err)
	}
	fmt.Printf("Schmeckt’s-Server %s\n\n%s", version, Overview(st, dir, time.Now()))
	return nil
}

func printConnection(cfg Config) error {
	fmt.Printf("Adresse:  http://%s:%d\n", lanAddress(), cfg.port())
	fmt.Printf("Code:  %s\n\n", cfg.Code)
	fmt.Println("In der App: Einstellungen, Haushalts-Server, Code eingeben.")
	if cfg.APIKey != "" {
		fmt.Println("Foto-Erkennung: eingerichtet")
	} else {
		fmt.Println("Foto-Erkennung: noch kein API-Schlüssel eingetragen")
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

// lanAddress looks for the PC's address on the home network, preferring 192.168.x.x.
func lanAddress() string {
	ifaces, _ := net.Interfaces()
	found := []string{}
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
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

func systemctl(args ...string) error {
	out, err := exec.Command("systemctl", args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("systemctl %s: %v %s", strings.Join(args, " "), err, out)
	}
	return nil
}

func restore(dir string, args []string) error {
	if err := requireRoot(); err != nil {
		return err
	}
	if len(args) != 1 {
		files, _ := filepath.Glob(filepath.Join(dir, backupDir, "state-*.json"))
		sort.Strings(files)
		msg := "Bitte ein Backup angeben, zum Beispiel:\n  sudo schmeckts-server restore " + filepath.Join(dir, backupDir, "state-JJJJ-MM-TT.json")
		if len(files) > 0 {
			msg += "\n\nVorhandene Backups:\n  " + strings.Join(files, "\n  ")
		}
		return errors.New(msg)
	}
	st, err := readState(args[0])
	if err != nil {
		return fmt.Errorf("Das Backup ist nicht lesbar: %w", err)
	}
	st.Epoch = newEpoch() // this makes every phone do a full resync
	usesSystemd := systemctl("is-active", "--quiet", "schmeckts") == nil
	if usesSystemd {
		if err := systemctl("stop", "schmeckts"); err != nil {
			return err
		}
	}
	s := &Store{dir: dir, st: st}
	if err := s.persist(); err != nil {
		return err
	}
	ownFiles(filepath.Join(dir, stateFile))
	if usesSystemd {
		if err := systemctl("start", "schmeckts"); err != nil {
			return err
		}
	}
	fmt.Printf("Wiederhergestellt aus %s. Die Handys gleichen beim nächsten Kontakt komplett neu ab.\n", filepath.Base(args[0]))
	return nil
}
