/* A reporter beside `dot` for scripts/test.sh: what a test says about itself with t.diagnostic(), such as the hit
   rate over the text recognition fixtures, printed once at the end. The runner's own totals carry no file and stay
   out. */
export default async function* notes(source) {
  const said = [];
  for await (const event of source)
    if (event.type === 'test:diagnostic' && event.data.file) said.push(event.data.message);
  if (said.length) yield `${said.join('\n')}\n`;
}
