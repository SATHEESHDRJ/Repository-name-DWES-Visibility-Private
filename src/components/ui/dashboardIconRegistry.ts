/**
 * Dashboard 3D icon registry — 3dicons.co V1 Color / Dynamic (CC0-1.0).
 * One unique source asset per semantic function.
 */
import folder from '../../assets/dashboard-icons/webp/folder.webp';
import chart from '../../assets/dashboard-icons/webp/chart.webp';
import flash from '../../assets/dashboard-icons/webp/flash.webp';
import tick from '../../assets/dashboard-icons/webp/tick.webp';
import fileText from '../../assets/dashboard-icons/webp/file-text.webp';
import clock from '../../assets/dashboard-icons/webp/clock.webp';
import flag from '../../assets/dashboard-icons/webp/flag.webp';
import thumbDown from '../../assets/dashboard-icons/webp/thumb-down.webp';
import setting from '../../assets/dashboard-icons/webp/setting.webp';
import cube from '../../assets/dashboard-icons/webp/cube.webp';
import toggle from '../../assets/dashboard-icons/webp/toggle.webp';
import colorPalette from '../../assets/dashboard-icons/webp/color-palette.webp';
import key from '../../assets/dashboard-icons/webp/key.webp';
import forward from '../../assets/dashboard-icons/webp/forward.webp';
import circle from '../../assets/dashboard-icons/webp/circle.webp';
import tool from '../../assets/dashboard-icons/webp/tool.webp';
import threeD from '../../assets/dashboard-icons/webp/3d.webp';
import boy from '../../assets/dashboard-icons/webp/boy.webp';
import girl from '../../assets/dashboard-icons/webp/girl.webp';
import zoom from '../../assets/dashboard-icons/webp/zoom.webp';
import wifi from '../../assets/dashboard-icons/webp/wifi.webp';
import fire from '../../assets/dashboard-icons/webp/fire.webp';
import trashCan from '../../assets/dashboard-icons/webp/trash-can.webp';
import medal from '../../assets/dashboard-icons/webp/medal.webp';
import link from '../../assets/dashboard-icons/webp/link.webp';
import computer from '../../assets/dashboard-icons/webp/computer.webp';
import lab from '../../assets/dashboard-icons/webp/lab.webp';
import lock from '../../assets/dashboard-icons/webp/lock.webp';
import explorer from '../../assets/dashboard-icons/webp/explorer.webp';
import notebook from '../../assets/dashboard-icons/webp/notebook.webp';
import bell from '../../assets/dashboard-icons/webp/bell.webp';
import pencil from '../../assets/dashboard-icons/webp/pencil.webp';
import plus from '../../assets/dashboard-icons/webp/plus.webp';
import copyImg from '../../assets/dashboard-icons/webp/copy.webp';
import picture from '../../assets/dashboard-icons/webp/picture.webp';
import targetImg from '../../assets/dashboard-icons/webp/target.webp';
import rocket from '../../assets/dashboard-icons/webp/rocket.webp';
import playImg from '../../assets/dashboard-icons/webp/play.webp';
import pauseImg from '../../assets/dashboard-icons/webp/pause.webp';
import backImg from '../../assets/dashboard-icons/webp/back.webp';
import nextImg from '../../assets/dashboard-icons/webp/next.webp';
import pinImg from '../../assets/dashboard-icons/webp/pin.webp';
import mapPin from '../../assets/dashboard-icons/webp/map-pin.webp';
import calender from '../../assets/dashboard-icons/webp/calender.webp';
import mobile from '../../assets/dashboard-icons/webp/mobile.webp';
import axe from '../../assets/dashboard-icons/webp/axe.webp';
import puzzleImg from '../../assets/dashboard-icons/webp/puzzle.webp';
import locker from '../../assets/dashboard-icons/webp/locker.webp';
import sphereImg from '../../assets/dashboard-icons/webp/sphere.webp';
import locationImg from '../../assets/dashboard-icons/webp/location.webp';

export type DashboardIconName =
  | 'projects' | 'status' | 'panels' | 'review_queue' | 'history' | 'ready_qc'
  | 'conditional' | 'failed' | 'settings' | 'workspace' | 'menu' | 'theme'
  | 'biometric' | 'logout' | 'close' | 'digital_wiring' | 'operational_twin'
  | 'assignment' | 'users' | 'refresh' | 'sync' | 'danger' | 'delete' | 'complete'
  | 'mid_change' | 'diagnostics' | 'inspect' | 'security' | 'explore' | 'notes'
  | 'notify' | 'edit' | 'add' | 'copy' | 'drawing' | 'target' | 'launch' | 'play'
  | 'pause' | 'back' | 'next' | 'pin' | 'map' | 'calendar' | 'device' | 'build'
  | 'puzzle' | 'vault' | 'sphere' | 'location';

export interface DashboardIconMeta {
  src: string;
  source: string;
  sourceUrl: string;
  license: 'CC0-1.0';
  style: 'color';
  angle: 'dynamic';
}

function entry(src: string, source: string, sourceUrl: string): DashboardIconMeta {
  return { src, source, sourceUrl, license: 'CC0-1.0', style: 'color', angle: 'dynamic' };
}

export const DASHBOARD_ICON_REGISTRY: Record<DashboardIconName, DashboardIconMeta> = {
  projects: entry(folder, 'folder', 'https://3dicons.co/icons/176980-folder'),
  status: entry(chart, 'chart', 'https://3dicons.co/icons/4a4275-chart'),
  panels: entry(flash, 'flash', 'https://3dicons.co/icons/637858-flash'),
  review_queue: entry(tick, 'tick', 'https://3dicons.co/icons/1b714e-tick'),
  history: entry(fileText, 'file-text', 'https://3dicons.co/icons/65d841-file-text'),
  ready_qc: entry(clock, 'clock', 'https://3dicons.co/icons/8ef1fa-clock'),
  conditional: entry(flag, 'flag', 'https://3dicons.co/icons/e9828b-flag'),
  failed: entry(thumbDown, 'thumb-down', 'https://3dicons.co/icons/d891e3-thumb-down'),
  settings: entry(setting, 'setting', 'https://3dicons.co/icons/7e47be-setting'),
  workspace: entry(cube, 'cube', 'https://3dicons.co/icons/4f52f8-cube'),
  menu: entry(toggle, 'toggle', 'https://3dicons.co/icons/6d3198-toggle'),
  theme: entry(colorPalette, 'color-palette', 'https://3dicons.co/icons/82db59-color-palette'),
  biometric: entry(key, 'key', 'https://3dicons.co/icons/778c78-key'),
  logout: entry(forward, 'forward', 'https://3dicons.co/icons/923d52-forward'),
  close: entry(circle, 'circle', 'https://3dicons.co/icons/0fa56a-circle'),
  digital_wiring: entry(tool, 'tool', 'https://3dicons.co/icons/ff5be0-tools'),
  operational_twin: entry(threeD, '3d', 'https://3dicons.co/icons/1c6625-3d'),
  assignment: entry(boy, 'boy', 'https://3dicons.co/icons/a14880-boy'),
  users: entry(girl, 'girl', 'https://3dicons.co/icons/2dfe27-girl'),
  refresh: entry(zoom, 'zoom', 'https://3dicons.co/icons/b4a0af-zoom'),
  sync: entry(wifi, 'wifi', 'https://3dicons.co/icons/16f789-wifi'),
  danger: entry(fire, 'fire', 'https://3dicons.co/icons/6bfe8c-fire'),
  delete: entry(trashCan, 'trash-can', 'https://3dicons.co/icons/add2ea-trash-can'),
  complete: entry(medal, 'medal', 'https://3dicons.co/icons/39121b-medal'),
  mid_change: entry(link, 'link', 'https://3dicons.co/icons/2d9fa2-link'),
  diagnostics: entry(computer, 'computer', 'https://3dicons.co/icons/5f20be-computer'),
  inspect: entry(lab, 'lab', 'https://3dicons.co/icons/56180e-lab'),
  security: entry(lock, 'lock', 'https://3dicons.co/icons/457612-lock'),
  explore: entry(explorer, 'explorer', 'https://3dicons.co/icons/a0330a-explorer'),
  notes: entry(notebook, 'notebook', 'https://3dicons.co/icons/628100-notebook'),
  notify: entry(bell, 'bell', 'https://3dicons.co/icons/ef4a90-bell'),
  edit: entry(pencil, 'pencil', 'https://3dicons.co/icons/66b0f8-pencil'),
  add: entry(plus, 'plus', 'https://3dicons.co/icons/33bdc6-plus'),
  copy: entry(copyImg, 'copy', 'https://3dicons.co/icons/d3d0c8-copy'),
  drawing: entry(picture, 'picture', 'https://3dicons.co/icons/19312f-picture'),
  target: entry(targetImg, 'target', 'https://3dicons.co/icons/49b6f4-target'),
  launch: entry(rocket, 'rocket', 'https://3dicons.co/icons/744cc0-rocket'),
  play: entry(playImg, 'play', 'https://3dicons.co/icons/866e45-play'),
  pause: entry(pauseImg, 'pause', 'https://3dicons.co/icons/fd6d80-pause'),
  back: entry(backImg, 'back', 'https://3dicons.co/icons/14180b-back'),
  next: entry(nextImg, 'next', 'https://3dicons.co/icons/cdb20a-next'),
  pin: entry(pinImg, 'pin', 'https://3dicons.co/icons/ae1a5e-pin'),
  map: entry(mapPin, 'map-pin', 'https://3dicons.co/icons/1858b9-map-pin'),
  calendar: entry(calender, 'calender', 'https://3dicons.co/icons/0ef25b-calender'),
  device: entry(mobile, 'mobile', 'https://3dicons.co/icons/1fded0-mobile'),
  build: entry(axe, 'axe', 'https://3dicons.co/icons/6f449f-axe'),
  puzzle: entry(puzzleImg, 'puzzle', 'https://3dicons.co/icons/a68576-puzzle'),
  vault: entry(locker, 'locker', 'https://3dicons.co/icons/e67951-locker'),
  sphere: entry(sphereImg, 'sphere', 'https://3dicons.co/icons/8034f3-sphere'),
  location: entry(locationImg, 'location', 'https://3dicons.co/icons/8bbd16-location'),
};

export function getDashboardIcon(name: DashboardIconName): DashboardIconMeta {
  return DASHBOARD_ICON_REGISTRY[name];
}
