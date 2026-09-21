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
      function jsxs(t, p, k) {
        return R.createElement.apply(R, [t, np(p, k)].concat(p.children));
      }
      module.exports = R;
      module.exports.jsx = jsx2;
      module.exports.jsxs = jsxs;
      module.exports.jsxDEV = function(t, p, k, s) {
        return (s ? jsxs : jsx2)(t, p, k);
      };
      module.exports.Fragment = R.Fragment;
    }
  });

  // .design-sync/previews/CompletionReport.tsx
  var CompletionReport_exports = {};
  __export(CompletionReport_exports, {
    Approved: () => Approved
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

  // .design-sync/previews/_fixtures.ts
  init_define_import_meta_env();
  var completionReportData = {
    technician: { full_name: "Rami Haddad", username: "rhaddad", employee_id: "ENW-114" },
    project: { code: "ENOWA-01", name: "Substation 3 Wiring", client: "ENOWA" },
    assignment: {
      id: 1,
      panel_name: "Main Panel",
      frame_id: "A12",
      status: "completed",
      cables_total: 142,
      cables_src_done: 142,
      cables_dst_done: 142,
      cables_both_done: 142,
      cables_pending: 0,
      kpi: 98,
      src_pct: 100,
      dst_pct: 100,
      started_at: "2024-05-15T08:00:00Z",
      completed_at: "2024-05-15T14:30:00Z",
      total_wiring_seconds: 23400,
      duration_human: "6h 30m",
      review_status: "approved",
      report_submitted: true
    },
    rollup: { total_frames: 24, completed_frames: 18, project_kpi: 92 },
    generated_at: "2024-05-15T14:35:00Z"
  };

  // .design-sync/previews/CompletionReport.tsx
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  function Approved() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { width: 720 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.CompletionReport, { data: completionReportData, onDownloadXlsx: () => {
    } }) });
  }
  return __toCommonJS(CompletionReport_exports);
})();
