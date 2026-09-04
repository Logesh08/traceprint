(function () {
  "use strict";

  var startedAt = performance.now();
  var observations = [];
  var prototypeObservations = [];
  var early = {
    version: 2,
    startedAt: startedAt,
    createdAt: new Date().toISOString(),
    webdriver: navigator.webdriver === true,
    headlessUserAgent: /HeadlessChrome/i.test(navigator.userAgent),
    globals: [],
    runtime: observations,
    prototypeRuntime: prototypeObservations
  };

  var markers = [
    "__pwInitScripts",
    "__playwright__binding__",
    "_phantom",
    "callPhantom",
    "__nightmare",
    "domAutomation",
    "domAutomationController"
  ];

  try {
    var ownNames = Object.getOwnPropertyNames(window);
    early.globals = ownNames.filter(function (name) {
      return /^cdc_[a-z0-9_]+$/i.test(name) || markers.indexOf(name) !== -1;
    });
  } catch (error) {
    early.globalsError = error instanceof Error ? error.message : String(error);
  }

  function emitRuntimeObservation(label) {
    var observation = {
      label: label,
      emittedAtMs: Number((performance.now() - startedAt).toFixed(3)),
      stackAccesses: 0,
      nameAccesses: 0,
      firstAccessAtMs: null,
      settledAtMs: null
    };
    var error = new Error("traceprint-" + label);

    function recordAccess(field) {
      observation[field] += 1;
      if (observation.firstAccessAtMs === null) {
        observation.firstAccessAtMs = Number((performance.now() - startedAt).toFixed(3));
      }
    }

    try {
      Object.defineProperty(error, "stack", {
        configurable: true,
        enumerable: false,
        get: function () {
          recordAccess("stackAccesses");
          return "Error: traceprint-" + label;
        }
      });
      Object.defineProperty(error, "name", {
        configurable: true,
        enumerable: false,
        get: function () {
          recordAccess("nameAccesses");
          return "Error";
        }
      });
      observations.push(observation);
      console.debug("[Traceprint runtime probe " + label + "]", error);
    } catch (probeError) {
      observation.error = probeError instanceof Error ? probeError.message : String(probeError);
      observations.push(observation);
    }

    setTimeout(function () {
      observation.settledAtMs = Number((performance.now() - startedAt).toFixed(3));
    }, 80);
  }

  function emitPrototypeObservation(label) {
    var observation = {
      label: label,
      emittedAtMs: Number((performance.now() - startedAt).toFixed(3)),
      ownKeysAccesses: 0,
      firstAccessAtMs: null,
      settledAtMs: null
    };

    try {
      var trap = new Proxy({}, {
        ownKeys: function () {
          observation.ownKeysAccesses += 1;
          if (observation.firstAccessAtMs === null) {
            observation.firstAccessAtMs = Number(
              (performance.now() - startedAt).toFixed(3)
            );
          }
          return [];
        }
      });
      var value = Object.create(trap);
      prototypeObservations.push(observation);
      console.groupEnd(value);
    } catch (probeError) {
      observation.error = probeError instanceof Error ? probeError.message : String(probeError);
      prototypeObservations.push(observation);
    }

    setTimeout(function () {
      observation.settledAtMs = Number((performance.now() - startedAt).toFixed(3));
    }, 80);
  }

  try {
    Object.defineProperty(window, "__TRACEPRINT_EARLY__", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: early
    });
  } catch {
    window.__TRACEPRINT_EARLY__ = early;
  }

  emitRuntimeObservation("head-sync");
  emitPrototypeObservation("head-prototype");
  queueMicrotask(function () {
    emitRuntimeObservation("head-microtask");
  });
})();
