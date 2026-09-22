/* One place for the errors that are not handled where they happen, so every report looks the same and none is
   dropped.
   where: a short English label for the spot, such as 'sync' or 'recognition (server)'.
   what:  the error, or a sentence when there is no error object.
   Warn instead of error: an error in the console fails the tests, and none of these stops the app. What a person
   has to know about is said in German by a toast or a banner where it happens. */
export function report(where, what) {
  console.warn(`${where}:`, what?.message || what);
}
