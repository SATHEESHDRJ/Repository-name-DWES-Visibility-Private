var __dsPreview = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // ds-raw:__ds_raw__
  var require_ds_raw = __commonJS({
    "ds-raw:__ds_raw__"(exports, module) {
      init_define_import_meta_env();
      module.exports = window.DWES;
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function np(p, k) {
        var o = {};
        for (var x in p) if (x !== "children") o[x] = p[x];
        if (k !== void 0) o.key = k;
        return o;
      }
      function jsx2(t, p, k) {
        var c = p && p.children;
        return c === void 0 ? R.createElement(t, np(p, k)) : R.createElement(t, np(p, k), c);
      }
      function jsxs2(t, p, k) {
        return R.createElement.apply(R, [t, np(p, k)].concat(p.children));
      }
      module.exports = R;
      module.exports.jsx = jsx2;
      module.exports.jsxs = jsxs2;
      module.exports.jsxDEV = function(t, p, k, s) {
        return (s ? jsxs2 : jsx2)(t, p, k);
      };
      module.exports.Fragment = R.Fragment;
    }
  });

  // .design-sync/previews/CableSchematic.tsx
  var CableSchematic_exports = {};
  __export(CableSchematic_exports, {
    WiredCables: () => WiredCables
  });
  init_define_import_meta_env();

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  init_define_import_meta_env();
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.DWES;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/CableSchematic.tsx
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  function WiredCables() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "0.75rem", width: 440, padding: "0.5rem" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        ds_exports.CableSchematic,
        {
          cable: { ferrule: "W-4021", color: "GREEN", size: "2.5", length: "12", source: "MP-1", destination: "TB3-04", source_device: "MP-1", source_terminal: "X1:4", dest_device: "TB3", dest_terminal: "04" },
          status: { src: true, dst: true },
          maxLengthMeters: 20
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        ds_exports.CableSchematic,
        {
          cable: { ferrule: "W-4023", color: "YELLOW", size: "1.5", length: "8", source: "MP-2", destination: "JB-11", source_device: "MP-2", source_terminal: "X2:1", dest_device: "JB-11", dest_terminal: "02" },
          status: { src: true, dst: false },
          maxLengthMeters: 20
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        ds_exports.CableSchematic,
        {
          cable: { ferrule: "W-4025", color: "BROWN", size: "4", length: "16", source: "SP-1", destination: "TB1-03", source_device: "SP-1", source_terminal: "X1:8", dest_device: "TB1", dest_terminal: "03" },
          status: { src: false, dst: false, issue: true, note: "Length mismatch vs schedule" },
          maxLengthMeters: 20
        }
      )
    ] });
  }
  return __toCommonJS(CableSchematic_exports);
})();
