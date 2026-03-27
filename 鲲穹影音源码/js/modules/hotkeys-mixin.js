/**
 * 热键表格与编辑 mixin
 */
import { i18n } from './i18n.js';

export default {
    generateHotkeyTable() {
        const tbody = document.getElementById('hotkeyTableBody');
        if (!tbody) return;

        if (!this.hotkeysDraft) {
            this.hotkeysDraft = { ...this.hotkeys };
        }

        const sourceHotkeys = this.hotkeysDraft;

        const hotkeyList = [
            { action: 'playPause', name: i18n.t('settings.hotkey.actions.playPause'), mouse: i18n.t('settings.hotkey.mouse_left') },
            { action: 'stop', name: i18n.t('settings.hotkey.actions.stop'), mouse: '' },
            { action: 'fastForward', name: i18n.t('settings.hotkey.actions.fastForward'), mouse: '' },
            { action: 'rewind', name: i18n.t('settings.hotkey.actions.rewind'), mouse: '' },
            { action: 'speedUp', name: i18n.t('settings.hotkey.actions.speedUp'), mouse: '' },
            { action: 'speedDown', name: i18n.t('settings.hotkey.actions.speedDown'), mouse: '' },
            { action: 'volumeUp', name: i18n.t('settings.hotkey.actions.volumeUp'), mouse: '' },
            { action: 'volumeDown', name: i18n.t('settings.hotkey.actions.volumeDown'), mouse: '' },
            { action: 'mute', name: i18n.t('settings.hotkey.actions.mute'), mouse: '' },
            { action: 'fullscreen', name: i18n.t('settings.hotkey.actions.fullscreen'), mouse: '' },
            { action: 'exitFullscreen', name: i18n.t('settings.hotkey.actions.exitFullscreen'), mouse: '' }
        ];

        tbody.innerHTML = '';
        hotkeyList.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.name}</td>
                <td>${item.mouse}</td>
                <td class="hotkey-cell" data-action="${item.action}">
                    <kbd>${this.formatHotkey(sourceHotkeys[item.action])}</kbd>
                </td>
                <td>
                    <button class="hotkey-edit-btn" data-action="${item.action}">${i18n.t('settings.hotkey.btn_modify')}</button>
                </td>
            `;

            tr.querySelector('.hotkey-edit-btn').addEventListener('click', () => {
                this.editHotkey(item.action, tr);
            });

            tbody.appendChild(tr);
        });
    },

    formatHotkey(hotkey) {
        if (hotkey === ' ') return i18n.currentLang === 'zh-CN' ? '空格' : 'Space';
        if (hotkey === 'Space') return i18n.currentLang === 'zh-CN' ? '空格' : 'Space';
        return hotkey.replace(/\+/g, ' + ');
    },

    editHotkey(action, row) {
        const cell = row.querySelector('.hotkey-cell');
        if (!this.hotkeysDraft) {
            this.hotkeysDraft = { ...this.hotkeys };
        }
        const currentHotkey = this.hotkeysDraft[action];

        cell.innerHTML = '<input type="text" class="hotkey-input" placeholder="按下新的快捷键..." readonly>';
        const input = cell.querySelector('.hotkey-input');
        input.focus();

        let keyPressed = false;

        const keyHandler = (e) => {
            e.preventDefault();

            if (e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift' || e.key === 'Meta') {
                return;
            }

            const newHotkey = this.getKeyCombo(e);

            const conflictAction = this.checkHotkeyConflict(newHotkey, action);
            if (conflictAction) {
                const conflictNames = {
                    'playPause': i18n.t('settings.hotkey.actions.playPause'),
                    'stop': i18n.t('settings.hotkey.actions.stop'),
                    'fastForward': i18n.t('settings.hotkey.actions.fastForward'),
                    'rewind': i18n.t('settings.hotkey.actions.rewind'),
                    'speedUp': i18n.t('settings.hotkey.actions.speedUp'),
                    'speedDown': i18n.t('settings.hotkey.actions.speedDown'),
                    'volumeUp': i18n.t('settings.hotkey.actions.volumeUp'),
                    'volumeDown': i18n.t('settings.hotkey.actions.volumeDown'),
                    'mute': i18n.t('settings.hotkey.actions.mute'),
                    'fullscreen': i18n.t('settings.hotkey.actions.fullscreen'),
                    'exitFullscreen': i18n.t('settings.hotkey.actions.exitFullscreen')
                };

                alert(`${i18n.t('settings.hotkey.title')}冲突！

快捷键 "${this.formatHotkey(newHotkey)}" 已被 "${conflictNames[conflictAction]}" 功能占用。

请设置其他快捷键。`);

                cell.innerHTML = `<kbd>${this.formatHotkey(currentHotkey)}</kbd>`;
                input.removeEventListener('keydown', keyHandler);
                input.removeEventListener('blur', blurHandler);
                document.removeEventListener('click', cancelEdit);
                return;
            }

            keyPressed = true;
            this.hotkeysDraft[action] = newHotkey;
            cell.innerHTML = `<kbd>${this.formatHotkey(newHotkey)}</kbd>`;
            console.log(`热键已更新(未保存): ${action} = ${newHotkey}`);
            input.removeEventListener('keydown', keyHandler);
            input.removeEventListener('blur', blurHandler);
            document.removeEventListener('click', cancelEdit);
        };

        const blurHandler = () => {
            if (!keyPressed) {
                console.log('热键设置已取消，恢复原热键');
                cell.innerHTML = `<kbd>${this.formatHotkey(currentHotkey)}</kbd>`;
                input.removeEventListener('keydown', keyHandler);
                document.removeEventListener('click', cancelEdit);
            }
        };

        input.addEventListener('keydown', keyHandler);
        input.addEventListener('blur', blurHandler);

        const cancelEdit = (e) => {
            if (!cell.contains(e.target)) {
                if (!keyPressed) {
                    console.log('点击外部，热键设置已取消');
                }
                cell.innerHTML = `<kbd>${this.formatHotkey(currentHotkey)}</kbd>`;
                input.removeEventListener('keydown', keyHandler);
                input.removeEventListener('blur', blurHandler);
                document.removeEventListener('click', cancelEdit);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', cancelEdit);
        }, 100);
    },

    checkHotkeyConflict(newHotkey, currentAction) {
        const source = this.hotkeysDraft || this.hotkeys;
        for (const [action, hotkey] of Object.entries(source)) {
            if (action !== currentAction && hotkey === newHotkey) {
                return action;
            }
        }
        return null;
    },

    saveHotkeys() {
        try {
            localStorage.setItem('player_hotkeys', JSON.stringify(this.hotkeys));
        } catch (e) {
            console.error('保存热键失败:', e);
        }
    },

    loadHotkeys() {
        try {
            const saved = localStorage.getItem('player_hotkeys');
            if (saved) {
                this.hotkeys = { ...this.hotkeys, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.error('加载热键失败:', e);
        }
    }
};
