/**
 * Named Material Symbols Rounded icon components (Lucide-compatible API).
 */
import { forwardRef } from 'react';
import { Icon, type IconProps } from '../Icon';

type NamedIconProps = Omit<IconProps, 'name'>;

function sym(
  materialName: string,
  defaults: Partial<NamedIconProps> = {},
) {
  return forwardRef<HTMLSpanElement, NamedIconProps>(function NamedIcon(
    { filled, className = '', ...props },
    ref,
  ) {
    const mergedClass = [defaults.className, className].filter(Boolean).join(' ');
    return (
      <Icon
        ref={ref}
        name={materialName}
        filled={filled ?? defaults.filled}
        className={mergedClass || undefined}
        {...props}
      />
    );
  });
}

/* ── Navigation & layout ─────────────────────────────────────────────────── */
export const Menu            = sym('menu');
export const X               = sym('close');
export const ChevronDown     = sym('expand_more');
export const ChevronUp       = sym('expand_less');
export const ChevronLeft     = sym('chevron_left');
export const ChevronRight    = sym('chevron_right');
export const ArrowRight      = sym('arrow_forward');
export const ArrowLeft       = sym('arrow_back');
export const ArrowLeftRight  = sym('swap_horiz');
export const ArrowDownUp     = sym('swap_vert');
export const ArrowUpRight    = sym('north_east');
export const PanelLeftClose  = sym('left_panel_close');
export const PanelLeftOpen   = sym('left_panel_open');
export const LayoutGrid      = sym('grid_view');
export const LayoutPanelTop  = sym('dashboard');
export const FolderKanban    = sym('view_kanban');
export const Maximize        = sym('fullscreen');

/* ── Actions ───────────────────────────────────────────────────────────────── */
export const Plus            = sym('add');
export const Pencil          = sym('edit');
export const Trash2          = sym('delete');
export const Download        = sym('download');
export const InstallDesktop  = sym('install_desktop');
export const Upload          = sym('upload');
export const RefreshCw       = sym('refresh');
export const RotateCcw       = sym('restart_alt');
export const Save            = sym('save');
export const Search          = sym('search');
export const Check           = sym('check');
export const CheckCheck      = sym('done_all');
export const SendHorizonal   = sym('send');
export const LogOut          = sym('logout');
export const ExternalLink    = sym('open_in_new');
export const ZoomIn          = sym('zoom_in');
export const ZoomOut         = sym('zoom_out');
export const Play            = sym('play_arrow');
export const PlayCircle      = sym('play_circle');
export const PauseCircle     = sym('pause_circle');
export const Eye             = sym('visibility');
export const EyeOff          = sym('visibility_off');
export const Star            = sym('star');
export const Flag            = sym('flag');
export const Info            = sym('info');
export const UserPlus        = sym('person_add');
export const UserMinus       = sym('person_remove');

/* ── Status & alerts ───────────────────────────────────────────────────────── */
export const CheckCircle     = sym('check_circle');
export const CheckCircle2    = sym('task_alt');
export const CheckSquare     = sym('check_box');
export const AlertCircle     = sym('error');
export const AlertTriangle   = sym('warning');
export const TriangleAlert   = sym('warning');
export const CircleX         = sym('cancel');
export const XCircle         = sym('cancel');
export const ShieldAlert     = sym('gpp_bad');
export const ShieldCheck     = sym('verified_user');
export const ShieldOff       = sym('remove_moderator');
export const Shield          = sym('shield');

/* ── Users & auth ──────────────────────────────────────────────────────────── */
export const User              = sym('person');
export const Users             = sym('group');
export const UserCog           = sym('manage_accounts');
export const UserX             = sym('person_off');
export const Fingerprint       = sym('fingerprint');
export const Lock              = sym('lock');
export const Unlock            = sym('lock_open');
export const Key               = sym('key');
export const KeyRound          = sym('key');
export const Mail              = sym('mail');
export const AtSign            = sym('alternate_email');
export const IdCard            = sym('badge');
export const Type              = sym('title');

/* ── Files & documents ─────────────────────────────────────────────────────── */
export const File              = sym('draft');
export const FileText          = sym('description');
export const FileImage         = sym('image');
export const FileSpreadsheet   = sym('table_chart');
export const FileDown          = sym('file_download');
export const FolderOpen        = sym('folder_open');
export const Paperclip         = sym('attach_file');
export const ClipboardCheck    = sym('assignment_turned_in');
export const ClipboardList     = sym('assignment');
export const Copy              = sym('content_copy');
export const ListChecks        = sym('checklist');

/* ── Tools & hardware ──────────────────────────────────────────────────────── */
export const Wrench            = sym('build');
export const PenTool           = sym('draw');
export const QrCode            = sym('qr_code_scanner');
export const Cable             = sym('cable');
export const Zap               = sym('bolt');
export const Database          = sym('database');
export const HardDrive         = sym('hard_drive');
export const Cloud             = sym('cloud');
export const Wifi              = sym('wifi');
export const Globe             = sym('language');

/* ── Business & location ───────────────────────────────────────────────────── */
export const Building2         = sym('apartment');
export const MapPin            = sym('location_on');
export const Map               = sym('map');
export const Calendar          = sym('calendar_today');
export const Tag               = sym('sell');
export const Hash              = sym('tag');
export const Phone             = sym('phone');
export const DollarSign        = sym('attach_money');

/* ── Charts & analytics ────────────────────────────────────────────────────── */
export const Activity          = sym('monitoring');
export const BarChart3         = sym('bar_chart');
export const Clock3            = sym('schedule');
export const Clock             = sym('schedule');

/* ── Misc UI ───────────────────────────────────────────────────────────────── */
export const Bell              = sym('notifications');
export const Settings          = sym('settings');
export const Moon              = sym('dark_mode');
export const Sun               = sym('light_mode');
export const Pin               = sym('push_pin');
export const Columns3          = sym('view_column');
export const PanelTop          = sym('web_asset');
export const MessageCircle     = sym('chat');
export const Loader            = sym('progress_activity', { className: 'ui-icon--spin' });
