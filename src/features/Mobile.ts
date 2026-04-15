import type ATOZVER6Plugin from '../main';
import { Platform, WorkspaceLeaf } from 'obsidian';

const CORE_BUTTON_SELECTOR = '.mobile-navbar-action.mobile-navbar-action-quick-switcher';
const EMPTY_TAB_TITLE_CLS = 'title-switcher-empty-tab-action';
const EMPTY_TAB_NEW_NOTE_CLS = 'atoz-new-note-empty-tab-action';

interface MobileCallbacks {
    onTitleSwitcher: () => void;
    onNewNote: () => void;
}

// ─── Mobile Launcher ─────────────────────────────────────────────────────────

class MobileLauncher {
    private coreLauncherButtonEl: HTMLElement | null = null;
    private qspLauncherButtonEl: HTMLElement | null = null;

    install(plugin: ATOZVER6Plugin, onClick: () => void): void {
        if (!Platform.isMobile || this.coreLauncherButtonEl) return;

        const containerEl = (plugin.app as any).mobileNavbar?.containerEl as HTMLElement | undefined;
        if (!containerEl) return;

        const coreButtonEl = containerEl.querySelector(CORE_BUTTON_SELECTOR) as HTMLElement | null;
        if (!coreButtonEl) return;

        const newButtonEl = coreButtonEl.cloneNode(true) as HTMLElement;
        newButtonEl.addEventListener('click', onClick);

        newButtonEl.style.display = 'none';
        if (coreButtonEl.insertAdjacentElement('beforebegin', newButtonEl)) {
            coreButtonEl.remove();
            newButtonEl.style.display = '';
            this.coreLauncherButtonEl = coreButtonEl;
            this.qspLauncherButtonEl = newButtonEl;
        }
    }

    uninstall(): void {
        if (!this.coreLauncherButtonEl || !this.qspLauncherButtonEl?.parentElement) return;

        this.coreLauncherButtonEl.style.display = 'none';
        if (this.qspLauncherButtonEl.insertAdjacentElement('beforebegin', this.coreLauncherButtonEl)) {
            this.qspLauncherButtonEl.remove();
            this.coreLauncherButtonEl.style.display = '';
            this.coreLauncherButtonEl = null;
            this.qspLauncherButtonEl = null;
        }
    }
}

// ─── Empty Tab Monitor ───────────────────────────────────────────────────────

class EmptyTabMonitor {
    private buttonByLeaf = new Map<WorkspaceLeaf, HTMLElement[]>();

    install(plugin: ATOZVER6Plugin, callbacks: MobileCallbacks): void {
        plugin.registerEvent(
            plugin.app.workspace.on('layout-change', () => {
                this.updateEmptyTabs(plugin, callbacks);
            })
        );

        plugin.app.workspace.onLayoutReady(() => {
            this.updateEmptyTabs(plugin, callbacks);
        });
    }

    uninstall(): void {
        for (const buttons of this.buttonByLeaf.values()) {
            buttons.forEach(btn => btn.detach());
        }
        this.buttonByLeaf.clear();
    }

    private updateEmptyTabs(plugin: ATOZVER6Plugin, callbacks: MobileCallbacks): void {
        plugin.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
            if (leaf.view.getViewType() !== 'empty') return;
            if (this.buttonByLeaf.has(leaf)) return;

            const buttonListEl = leaf.view.containerEl.querySelector('.empty-state-action-list');
            if (!buttonListEl) return;

            const titleBtn = buttonListEl.createDiv({
                cls: ['empty-state-action', 'tappable', EMPTY_TAB_TITLE_CLS],
                text: '파일로 이동하기',
            });
            titleBtn.addEventListener('click', callbacks.onTitleSwitcher);

            const newNoteBtn = buttonListEl.createDiv({
                cls: ['empty-state-action', 'tappable', EMPTY_TAB_NEW_NOTE_CLS],
                text: '새 파일 생성하기',
            });
            newNoteBtn.addEventListener('click', callbacks.onNewNote);

            buttonListEl.insertBefore(titleBtn, buttonListEl.firstElementChild);
            buttonListEl.insertBefore(newNoteBtn, buttonListEl.firstElementChild);

            this.buttonByLeaf.set(leaf, [newNoteBtn, titleBtn]);
        });
    }
}

// ─── Feature ─────────────────────────────────────────────────────────────────

export class MobileFeature {
    private mobileLauncher = new MobileLauncher();
    private emptyTabMonitor = new EmptyTabMonitor();

    constructor(private plugin: ATOZVER6Plugin) {}

    install(callbacks: MobileCallbacks): void {
        if (Platform.isMobileApp) {
            if (window.screen.width >= 800) {
                document.body.classList.add('mobile-toolbar-off', 'tablet-narrow-frontmatter');
            } else {
                document.body.classList.add('notice-bottom', 'hide-viriya-folder');
            }
        }

        this.mobileLauncher.install(this.plugin, callbacks.onTitleSwitcher);
        this.emptyTabMonitor.install(this.plugin, callbacks);
    }

    uninstall(): void {
    	document.body.classList.remove('mobile-toolbar-off', 'tablet-narrow-frontmatter', 'notice-bottom', 'hide-viriya-folder');
        this.mobileLauncher.uninstall();
        this.emptyTabMonitor.uninstall();
    }
}
