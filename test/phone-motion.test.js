import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { CONFIG } from "../public/config.js";
import { MSG, DRIVE_MODES, makeInput } from "../public/shared/protocol.js";

// Exercise the phone's real sensor/status handlers with a small DOM substitute.
function controller(secure) {
  const elements = new Map();
  const document = {
    addEventListener: function () {},
    getElementById: function (id) {
      if (!elements.has(id)) elements.set(id, {
        textContent: "", style: {}, lastChild: { textContent: "" },
        addEventListener: function () {},
        classList: { add: function () {}, remove: function () {}, toggle: function () {} },
      });
      return elements.get(id);
    },
  };
  const context = vm.createContext({
    document: document, window: { isSecureContext: secure, orientation: 90 },
    CONFIG: CONFIG, MSG: MSG, DRIVE_MODES: DRIVE_MODES, makeInput: makeInput,
  });
  const source = readFileSync(new URL("../public/phone.js", import.meta.url), "utf8");
  vm.runInContext(source.replace(/^import .*;$/gm, ""), context);
  return { elements: elements, run: function (code) { return vm.runInContext(code, context); } };
}

test("HTTP phone controller keeps the HTTPS cause visible after Start is hidden", function () {
  const phone = controller(false);
  phone.elements.get("startScreen").style.display = "none";
  phone.run("checkTiltIsWorking()");
  assert.match(phone.elements.get("tilt").textContent, /HTTPS required/);
  assert.match(phone.elements.get("tiltHelp").textContent, /game's QR code/);
});

test("secure controller distinguishes missing permission from arriving sensor readings", function () {
  const phone = controller(true);
  phone.run("checkTiltIsWorking()");
  assert.match(phone.elements.get("tiltHelp").textContent, /Allow motion access/);
  phone.run("for (let i = 0; i < 10; i++) onOrientation({beta: 20, gamma: 0}); checkTiltIsWorking()");
  assert.match(phone.elements.get("tilt").textContent, /tilt OK/);
  assert.equal(phone.elements.get("tiltHelp").style.display, "none");
  assert.notEqual(phone.run("input.steer"), 0);
});
