# The example mailbag

`sample-mailbag.json` contains two fictional public postcards: a Cumberland
maker's request for a rotary encoder and a reply from DEF CON. Every example
handle begins with `sample-`, and every place stamp begins with `Example ·`.

To inspect a real file, use **Open a mailbag** and choose this JSON file. The
preview adds nothing until you accept it. Accepting deliberately adds the
example thread to that desk.

For a practice delivery that never mixes with your board, use **Try a
delivery** inside the app instead. Fresh installations always start empty.

The editable generator is `scripts/make-sample.mjs`. Run it with Node 22 or
newer only if you want to regenerate the fictional sample with new IDs.
This file is not a backup and contains no private drafts or preferences.

## Reply-before-parent fixtures

`reply-first-seed.json` is an explicitly partial example delivery: it contains
only the reply and that reply's own path. `parent-later.json` contains its
original parent postcard. These are protocol fixtures, not browser downloads
claimed as test evidence.

For a normal-control test, import the seed into a disposable sender desk,
accept it, and **Pack mailbag** there. Deliver that actual downloaded file to
a separate empty desk. It should show the reply waiting for its parent. Then
open `parent-later.json` on that recipient: one thread should contain both
postcards. Reopening either accepted file should change no marks or messages.
