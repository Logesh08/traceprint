import { collectAutomationReport } from "./cdp";
import { sha256 } from "./hash";
import type { BrowserCapture } from "./types";

type AnyRecord = Record<string, unknown>;

function descriptor(target: object, key: PropertyKey) {
  const value = Object.getOwnPropertyDescriptor(target, key);
  if (!value) return null;
  return {
    configurable: value.configurable,
    enumerable: value.enumerable,
    writable: "writable" in value ? value.writable : undefined,
    hasGetter: typeof value.get === "function",
    hasSetter: typeof value.set === "function"
  };
}

async function identityProbe() {
  const nav = navigator as Navigator & {
    userAgentData?: {
      brands?: Array<{ brand: string; version: string }>;
      mobile?: boolean;
      platform?: string;
      getHighEntropyValues?: (hints: string[]) => Promise<AnyRecord>;
    };
  };
  let highEntropy: AnyRecord | null = null;
  try {
    highEntropy =
      (await nav.userAgentData?.getHighEntropyValues?.([
        "architecture",
        "bitness",
        "formFactor",
        "fullVersionList",
        "model",
        "platformVersion",
        "uaFullVersion",
        "wow64"
      ])) ?? null;
  } catch (error) {
    highEntropy = { error: error instanceof Error ? error.name : "unknown" };
  }
  return {
    userAgent: nav.userAgent,
    appVersion: nav.appVersion,
    platform: nav.platform,
    vendor: nav.vendor,
    product: nav.product,
    productSub: nav.productSub,
    language: nav.language,
    languages: Array.from(nav.languages),
    cookieEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack,
    pdfViewerEnabled: nav.pdfViewerEnabled,
    webdriver: nav.webdriver,
    userAgentData: nav.userAgentData
      ? {
          brands: nav.userAgentData.brands,
          mobile: nav.userAgentData.mobile,
          platform: nav.userAgentData.platform,
          highEntropy
        }
      : null,
    descriptors: {
      webdriver: descriptor(Navigator.prototype, "webdriver"),
      languages: descriptor(Navigator.prototype, "languages"),
      plugins: descriptor(Navigator.prototype, "plugins")
    }
  };
}

function screenProbe() {
  return {
    width: screen.width,
    height: screen.height,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth,
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    screenX: window.screenX,
    screenY: window.screenY,
    orientation: screen.orientation
      ? { type: screen.orientation.type, angle: screen.orientation.angle }
      : null,
    maxTouchPoints: navigator.maxTouchPoints
  };
}

function localeProbe() {
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  return {
    timeZone: resolved.timeZone,
    locale: resolved.locale,
    calendar: resolved.calendar,
    numberingSystem: resolved.numberingSystem,
    hourCycle: resolved.hourCycle,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    dateSample: new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeStyle: "long"
    }).format(new Date("2025-06-15T12:34:56Z")),
    numberSample: new Intl.NumberFormat().format(1234567.89)
  };
}

async function hardwareProbe() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  let storage: unknown = null;
  let mediaDevices: unknown = { supported: false };
  try {
    storage = (await navigator.storage?.estimate?.()) ?? null;
  } catch (error) {
    storage = { error: error instanceof Error ? error.name : "unknown" };
  }
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices?.();
    if (devices) {
      const counts: Record<string, number> = {};
      devices.forEach((device) => {
        counts[device.kind] = (counts[device.kind] ?? 0) + 1;
      });
      mediaDevices = {
        supported: true,
        counts,
        labelsExposed: devices.some((device) => Boolean(device.label))
      };
    }
  } catch (error) {
    mediaDevices = {
      supported: true,
      error: error instanceof Error ? error.name : "unknown"
    };
  }
  return {
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory ?? null,
    storage,
    mediaDevices
  };
}

function graphicsProbe() {
  const canvas = document.createElement("canvas");
  const gl = (canvas.getContext("webgl") ||
    canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  if (!gl) return { supported: false };
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    supported: true,
    vendor: gl.getParameter(gl.VENDOR),
    renderer: gl.getParameter(gl.RENDERER),
    unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
    unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    version: gl.getParameter(gl.VERSION),
    shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxViewportDims: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array),
    extensions: gl.getSupportedExtensions()?.slice().sort() ?? []
  };
}

async function canvasProbe() {
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 100;
  const context = canvas.getContext("2d");
  if (!context) return { supported: false };
  context.textBaseline = "alphabetic";
  context.fillStyle = "#9d7cff";
  context.fillRect(8, 8, 112, 58);
  context.fillStyle = "#d8f5ff";
  context.font = "19px Arial";
  context.fillText("Traceprint ◈ 0O1l", 16, 43);
  context.globalCompositeOperation = "multiply";
  context.beginPath();
  context.fillStyle = "rgba(82, 210, 255, .72)";
  context.arc(132, 43, 29, 0, Math.PI * 2);
  context.fill();
  const encoded = canvas.toDataURL();
  return {
    supported: true,
    hash: await sha256(encoded),
    winding: context.isPointInPath(4, 4, "evenodd"),
    textWidth: Number(context.measureText("Traceprint ◈ 0O1l").width.toFixed(4))
  };
}

async function audioProbe() {
  try {
    if (!window.OfflineAudioContext) return { supported: false };
    const context = new OfflineAudioContext(1, 5000, 44100);
    const oscillator = context.createOscillator();
    const compressor = context.createDynamicsCompressor();
    oscillator.type = "triangle";
    oscillator.frequency.value = 10000;
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;
    oscillator.connect(compressor);
    compressor.connect(context.destination);
    oscillator.start(0);
    const rendered = await context.startRendering();
    const samples = rendered.getChannelData(0).slice(4200, 4700);
    const sum = samples.reduce((total, sample) => total + Math.abs(sample), 0);
    const serialized = Array.from(samples.slice(0, 100), (value) => value.toFixed(7)).join(",");
    return {
      supported: true,
      sampleSum: Number(sum.toFixed(8)),
      hash: await sha256(serialized)
    };
  } catch (error) {
    return { supported: true, error: error instanceof Error ? error.name : "unknown" };
  }
}

function fontProbe() {
  const candidates = [
    "Arial",
    "Calibri",
    "Cambria",
    "Courier New",
    "Georgia",
    "Helvetica Neue",
    "Liberation Sans",
    "Noto Sans",
    "Roboto",
    "Segoe UI",
    "Tahoma",
    "Times New Roman",
    "Ubuntu",
    "Verdana"
  ];
  const detected = candidates.filter((font) => document.fonts?.check("16px " + JSON.stringify(font)));
  return { detected, tested: candidates.length };
}

async function permissionProbe() {
  const names = ["geolocation", "notifications", "camera", "microphone"] as PermissionName[];
  const values: Record<string, string> = {};
  await Promise.all(
    names.map(async (name) => {
      try {
        values[name] = (await navigator.permissions.query({ name })).state;
      } catch {
        values[name] = "unsupported";
      }
    })
  );
  return values;
}

async function workerProbe(): Promise<Record<string, unknown>> {
  if (typeof Worker === "undefined") return { supported: false };
  const source =
    "onmessage=async()=>{const n=self.navigator;let h=null;try{h=await n.userAgentData?.getHighEntropyValues?.(['architecture','bitness','model','platformVersion','uaFullVersion'])||null}catch(e){h={error:e.name}};postMessage({userAgent:n.userAgent,platform:n.platform,language:n.language,languages:[...n.languages],hardwareConcurrency:n.hardwareConcurrency,userAgentData:n.userAgentData?{brands:n.userAgentData.brands,mobile:n.userAgentData.mobile,platform:n.userAgentData.platform,highEntropy:h}:null})}";
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const worker = new Worker(url);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ supported: true, error: "timeout" });
    }, 1500);
    worker.onmessage = (event) => {
      window.clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ supported: true, navigator: event.data });
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ supported: true, error: "worker-error" });
    };
    worker.postMessage("collect");
  });
}

export async function collectBrowserFingerprint(): Promise<BrowserCapture> {
  const started = performance.now();
  const [browser, hardware, canvas, audio, permissions, workers, automation] =
    await Promise.all([
      identityProbe(),
      hardwareProbe(),
      canvasProbe(),
      audioProbe(),
      permissionProbe(),
      workerProbe(),
      collectAutomationReport()
    ]);

  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    durationMs: Number((performance.now() - started).toFixed(2)),
    browser,
    screen: screenProbe(),
    locale: localeProbe(),
    hardware,
    graphics: graphicsProbe(),
    canvas,
    audio,
    fonts: fontProbe(),
    features: {
      permissions,
      webGpu: "gpu" in navigator,
      webRtc: "RTCPeerConnection" in window,
      serviceWorker: "serviceWorker" in navigator,
      sharedWorker: "SharedWorker" in window,
      sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
      crossOriginIsolated: window.crossOriginIsolated,
      chromeObject: "chrome" in window,
      pluginCount: navigator.plugins.length,
      mimeTypeCount: navigator.mimeTypes.length,
      indexedDb: "indexedDB" in window,
      localStorage: (() => {
        try {
          return Boolean(window.localStorage);
        } catch {
          return false;
        }
      })()
    },
    workers,
    automation
  };
}
