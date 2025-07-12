import { once } from 'events';
import { existsSync, createReadStream, writeFileSync } from 'fs';
import { createInterface } from 'readline';

function translateKeys(x) {
  switch(x) {
    case "'":
      return 'SQT';
    case '`':
      return 'BSPC';
    case '~':
      return 'DELETE';
    case '_':
      return 'SPC';
    case '.':
      return 'DOT';
    case '@':
      return 'AT';
    default:
      return x;
  }
}

function mapBindings(x) {
  if (x.match(/[A-Z]/)) {
    return `&sk LSHIFT &kp ${x.toUpperCase()}`
  }

  return `&kp ${translateKeys(x).toUpperCase()}`
}

(async function processLineByLine() {
  try {
    const keymap = process.argv[2];
    if (!keymap) {
      throw new Error(`Missing keymap filename, please pass as first argument`);
    }
    if (!existsSync(keymap)) {
      throw new Error(`Unable to find keymap file ${keymap}`);
    }
    let rl = createInterface({
      input: createReadStream('chords.txt'),
      crlfDelay: Infinity
    });

    let macros = '';
    let combos = '';
    let used = {};

    rl.on('line', (line) => {
      if (line[0] === "#") {
        return
      }
      let [word, keys] = line.split(' ');
      if (keys === undefined || keys.length == 0) {
        console.log(`Warning: ${word} is missing a chord`)
        return
      }
      let index = keys.split('').sort().join('');
      if (used[index]) {
        throw new Error(`Can't use combo '${keys}' for word '${word}' already used by ${used[index]}`)
      }
      used[index] = word;
      const macro='m_' + keys.split('').map(translateKeys).join('');
      const inputs = keys.toUpperCase().split('').map(translateKeys);
      const bindings = word.split('').map(mapBindings).join(' ') + ' &kp SPACE';

      // wait-ms = <MACRO_WAIT>;
      // tap-ms = <MACRO_TAP>;
      macros += `    // ${word}
    ZMK_MACRO(${macro},
        bindings = <${bindings}>;
    )
`

      // timeout-ms = <COMBO_TIMEOUT>;
      const positions = 'P_' + inputs.join(' P_');
    combos += `    // ${word}
    combo_${macro} {
      key-positions = <${positions}>;
      bindings = <&${macro}>;
    };
`
    });

    await once(rl, 'close');

    rl = createInterface({
      input: createReadStream(keymap),
      crlfDelay: Infinity
    });

    let output = '';
    let mode = 'normal';
    let foundMacros = false;
    let foundCombos = false;
    rl.on('line', (line) => {
      if (mode === 'normal') {
        output += line + '\n';
        if (line.includes('MACROS START')) {
          mode = 'macros';
        } else if (line.includes('COMBOS START')) {
          mode = 'combos';
        }
      } else if (mode === 'macros') {
        if (line.includes('MACROS END')) {
          foundMacros = true;
          output += macros + '\n' + line + '\n';
          mode = 'normal';
        }
      } else if (mode === 'combos') {
        if (line.includes('COMBOS END')) {
          foundCombos = true;
          output += combos + '\n' + line + '\n';
          mode = 'normal';
        }
      }
    });

    await once(rl, 'close');

    if (!foundMacros) {
      throw new Error(`Unable to find MACROS START/END, please add the comments to your keymap:
        macros {
          // MACROS START
          // MACROS END
        }
      `)
    }
    if (!foundCombos) {
      throw new Error(`Unable to find MACROS START/END, please add the comments to your keymap:
        combos {
          compatible = "zmk,combos";
          // COMBOS START
          // COMBOS END
        }
      `)
    }
    writeFileSync(keymap, output, { encoding: "utf8", flag: "w", mode: 0o644 });
  } catch (err) {
    console.error(err);
  }
})();
