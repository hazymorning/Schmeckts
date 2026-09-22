/* One way to report something that went wrong. Everything that is not handled on the spot goes through here, so
   there is a single place that decides what a report looks like and nothing disappears in silence.
   where: a short English label for the spot, such as 'sync' or 'recognition (server)'.
   what:  the error, or a sentence when there is no error object.
   A warning, never console.error: an error in the console fails the tests, and none of these stops the app;
   whatever a person has to know about is said in German by a toast or a banner at the place it happens. */
export function report(where, what) {
  console.warn(`${where}:`, what?.message || what);
}
