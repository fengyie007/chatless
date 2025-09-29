"use client";

import { create } from "zustand";
import StorageUtil from "@/lib/storage";
import type { SectionIconPreset } from "@/components/settings/SectionIcon";

const SHOW_SETTING_ICONS_KEY = "ui_show_setting_icons";
const SIMPLE_MODE_KEY = "ui_simple_mode";
const LOW_ANIMATION_KEY = "ui_low_animation";
const SIDEBAR_WIDTH_KEY = "ui_sidebar_width"; // 'narrow' | 'medium' | 'wide'
const COLLAPSE_CHAT_SIDEBAR_KEY = "ui_collapse_chat_sidebar";
const TIMEZONE_KEY = "ui_timezone"; // e.g. 'local', 'UTC', 'UTC+8', 'America/New_York'
const SHOW_CLOSE_CONFIRMATION_KEY = "ui_show_close_confirmation";

type SidebarWidth = 'narrow' | 'medium' | 'wide' | 'xwide';
type IconSize = 'small' | 'medium' | 'large';

type CharFadeIntensity = 'off' | 'light' | 'normal' | 'strong';
type WindowSizePreset = '900x700' | '1024x768' | '1280x800' | '1366x768' | '1440x900' | '1600x900';

interface UiPreferencesState {
  // 基础
  initialized: boolean;

  // 视觉
  showSettingIcons: boolean;
  simpleMode: boolean;
  lowAnimationMode: boolean;
  settingsIconPreset: SectionIconPreset; // 新增：设置页图标预设

  // 布局
  sidebarWidth: SidebarWidth;
  collapseChatSidebar: boolean;

  sidebarIconSize: IconSize;

  // 时间
  timezone: string; // 使用 IANA 或简写

  // 快捷指令面板
  cmdPaletteEnabled: boolean;
  cmdPaletteShortcut: string;

  // 应用行为
  showCloseConfirmation: boolean;

  // 逐字淡入强度
  charFadeIntensity: CharFadeIntensity;
  // 窗口尺寸预设
  windowSizePreset: WindowSizePreset;

  // setter
  setShowSettingIcons: (show: boolean) => void;
  setSimpleMode: (flag: boolean) => void;
  setLowAnimationMode: (flag: boolean) => void;
  setSettingsIconPreset: (p: SectionIconPreset) => void;
  setSidebarWidth: (w: SidebarWidth) => void;
  setSidebarIconSize: (s: IconSize) => void;
  setCollapseChatSidebar: (flag: boolean) => void;
  setTimezone: (tz: string) => void;
  setCmdPaletteEnabled: (flag: boolean) => void;
  setCmdPaletteShortcut: (sc: string) => void;
  setShowCloseConfirmation: (flag: boolean) => void;
  setCharFadeIntensity: (v: CharFadeIntensity) => void;
  setWindowSizePreset: (v: WindowSizePreset) => void;
}

export const useUiPreferences = create<UiPreferencesState>((set) => ({
  initialized: false,

  showSettingIcons: true,
  simpleMode: true,
  lowAnimationMode: false,
  settingsIconPreset: 'brand',

  sidebarWidth: 'narrow',
  collapseChatSidebar: true,

  sidebarIconSize: 'small',

  timezone: 'local',

  cmdPaletteEnabled: true,
  cmdPaletteShortcut: 'ctrl+p',

  showCloseConfirmation: true,
  charFadeIntensity: 'normal',
  windowSizePreset: '1024x768',

  setShowSettingIcons: (show) => {
    set({ showSettingIcons: show });
    StorageUtil.setItem<boolean>(SHOW_SETTING_ICONS_KEY, show, 'user-preferences.json');
  },

  setSimpleMode: (flag) => {
    set({ simpleMode: flag });
    StorageUtil.setItem<boolean>(SIMPLE_MODE_KEY, flag, 'user-preferences.json');
  },

  setLowAnimationMode: (flag) => {
    set({ lowAnimationMode: flag });
    StorageUtil.setItem<boolean>(LOW_ANIMATION_KEY, flag, 'user-preferences.json');
  },

  setSettingsIconPreset: (p) => {
    set({ settingsIconPreset: p });
    StorageUtil.setItem<SectionIconPreset>('ui_settings_icon_preset', p, 'user-preferences.json');
  },

  setSidebarWidth: (w) => {
    set({ sidebarWidth: w });
    StorageUtil.setItem<SidebarWidth>(SIDEBAR_WIDTH_KEY, w, 'user-preferences.json');
  },

  setSidebarIconSize: (s) => {
    set({ sidebarIconSize: s });
    StorageUtil.setItem<IconSize>('ui_sidebar_icon_size', s, 'user-preferences.json');
  },

  setCollapseChatSidebar: (flag) => {
    set({ collapseChatSidebar: flag });
    StorageUtil.setItem<boolean>(COLLAPSE_CHAT_SIDEBAR_KEY, flag, 'user-preferences.json');
  },

  setTimezone: (tz) => {
    set({ timezone: tz });
    StorageUtil.setItem<string>(TIMEZONE_KEY, tz, 'user-preferences.json');
  },

  setCmdPaletteEnabled: (flag) => {
    set({ cmdPaletteEnabled: flag });
    StorageUtil.setItem<boolean>('ui_cmd_palette_enabled', flag, 'user-preferences.json');
  },

  setCmdPaletteShortcut: (sc) => {
    set({ cmdPaletteShortcut: sc });
    StorageUtil.setItem<string>('ui_cmd_palette_shortcut', sc, 'user-preferences.json');
  },

  setShowCloseConfirmation: (flag) => {
    set({ showCloseConfirmation: flag });
    StorageUtil.setItem<boolean>(SHOW_CLOSE_CONFIRMATION_KEY, flag, 'user-preferences.json');
  },
  setCharFadeIntensity: (v) => {
    set({ charFadeIntensity: v });
    StorageUtil.setItem<CharFadeIntensity>('ui_char_fade_intensity', v, 'user-preferences.json');
  },
  setWindowSizePreset: (v) => {
    set({ windowSizePreset: v });
    StorageUtil.setItem<WindowSizePreset>('ui_window_size_preset', v, 'user-preferences.json');
  },
}));

// 异步初始化首选项
(async () => {
  const [showIcon, simple, lowAnim, width, collapse, tz, iconSize, cpEnabled, cpShortcut, showCloseConfirm, charFadeIntensity, iconPreset, windowSizePreset] = await Promise.all([
    StorageUtil.getItem<boolean>(SHOW_SETTING_ICONS_KEY, true, 'user-preferences.json'),
    StorageUtil.getItem<boolean>(SIMPLE_MODE_KEY, true, 'user-preferences.json'),
    StorageUtil.getItem<boolean>(LOW_ANIMATION_KEY, false, 'user-preferences.json'),
    StorageUtil.getItem<SidebarWidth>(SIDEBAR_WIDTH_KEY, 'narrow', 'user-preferences.json'),
    StorageUtil.getItem<boolean>(COLLAPSE_CHAT_SIDEBAR_KEY, true, 'user-preferences.json'),
    StorageUtil.getItem<string>(TIMEZONE_KEY, 'local', 'user-preferences.json'),
    StorageUtil.getItem<IconSize>('ui_sidebar_icon_size', 'small', 'user-preferences.json'),
    StorageUtil.getItem<boolean>('ui_cmd_palette_enabled', true, 'user-preferences.json'),
    StorageUtil.getItem<string>('ui_cmd_palette_shortcut', 'ctrl+p', 'user-preferences.json'),
    StorageUtil.getItem<boolean>(SHOW_CLOSE_CONFIRMATION_KEY, true, 'user-preferences.json'),
    StorageUtil.getItem<CharFadeIntensity>('ui_char_fade_intensity', 'normal', 'user-preferences.json'),
    StorageUtil.getItem<SectionIconPreset>('ui_settings_icon_preset', 'brand', 'user-preferences.json'),
    StorageUtil.getItem<WindowSizePreset>('ui_window_size_preset', '1024x768', 'user-preferences.json'),
  ]);

  useUiPreferences.setState({
    showSettingIcons: showIcon ?? true,
    simpleMode: simple ?? false,
    lowAnimationMode: lowAnim ?? false,
    sidebarWidth: (width as SidebarWidth) ?? 'medium',
    collapseChatSidebar: collapse ?? false,
    sidebarIconSize: (iconSize as IconSize) ?? 'small',
    timezone: tz || 'local',
    cmdPaletteEnabled: cpEnabled ?? true,
    cmdPaletteShortcut: cpShortcut || 'ctrl+p',
    showCloseConfirmation: showCloseConfirm ?? true,
    charFadeIntensity: (charFadeIntensity as CharFadeIntensity) ?? 'normal',
    settingsIconPreset: (iconPreset as SectionIconPreset) ?? 'brand',
    windowSizePreset: (windowSizePreset as WindowSizePreset) ?? '1024x768',
    initialized: true,
  });
})(); 