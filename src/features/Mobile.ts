import type ATOZVER6Plugin from '../main';
import { Platform } from 'obsidian';

export class MobileFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    install(): void {
        if (Platform.isMobileApp) {
            if (window.screen.width >= 800) {
                document.body.classList.add('mobile-toolbar-off');
            } else {
                document.body.classList.add('notice-bottom');
            }
        }
    }

    uninstall(): void {
        document.body.classList.remove('mobile-toolbar-off', 'notice-bottom');
    }
}
