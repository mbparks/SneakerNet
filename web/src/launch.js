/* A classic deferred script can explain a file:// launch even when ESM cannot. */
(() => {
  if (window.location.protocol !== 'file:') return;

  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  for (const id of ['write-button', 'open-button', 'pack-button', 'tools-button', 'station-button', 'try-button', 'theme-select', 'search']) {
    const control = document.getElementById(id);
    if (control) control.disabled = true;
  }

  const notice = document.getElementById('notice');
  if (!notice) return;
  const panel = make('div', null, 'notice error');
  panel.setAttribute('role', 'alert');
  panel.append(
    make('h2', 'Give the desk a local address'),
    make('p', 'This page was opened as a file. To save mail and set up offline reopening, start the included local file server or use a static HTTPS host. No mail has been loaded or changed.')
  );
  const steps = document.createElement('ol');
  steps.append(make('li', 'Extract the complete ZIP, then open a terminal in the sneakernet-social-club folder.'));
  const run = make('li', 'Run: ');
  run.append(make('code', 'python3 serve.py'));
  steps.append(run);
  const open = make('li', 'Open ');
  const address = make('a', 'http://127.0.0.1:8787/');
  address.href = 'http://127.0.0.1:8787/';
  open.append(address, document.createTextNode(' and wait for “Offline ready.” Bookmark that address to return to this desk.'));
  steps.append(open);
  panel.append(steps, make('p', 'For phones or a shared setup address, upload the extracted application folder to a static HTTPS host. Each browser keeps its own desk.', 'hint'));
  notice.replaceChildren(panel);
  notice.hidden = false;

  const saved = document.getElementById('save-status');
  if (saved) saved.textContent = 'Desk not started · no mail loaded';
  const offline = document.getElementById('offline-status');
  if (offline) offline.textContent = 'Offline setup needs HTTPS or localhost';
})();
