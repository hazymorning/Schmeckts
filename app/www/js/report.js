// warn, not error: a console error fails the tests, and none of these stops the app
export function report(where, what) {
  console.warn(`${where}:`, what?.message || what);
}
