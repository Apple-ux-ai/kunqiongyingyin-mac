/**
 * DLNA 投屏 mixin
 */
import { i18n } from './i18n.js';

export default {
    showDlnaDialog() {
        this.dlnaDialog.style.display = 'block';
        this.dlnaDialog.classList.add('active');
        console.log('打开DLNA设备列表');

        this.refreshDlnaDevices();
    },

    hideDlnaDialog() {
        this.dlnaDialog.classList.remove('active');
        this.dlnaDialog.style.display = 'none';
        console.log('关闭DLNA设备列表');
    },

    refreshDlnaDevices() {
        console.log('刷新DLNA设备列表');

        const dlnaLoading = document.getElementById('dlnaLoading');
        const deviceList = document.getElementById('dlnaDeviceList');

        if (dlnaLoading) dlnaLoading.style.display = 'block';
        if (deviceList) deviceList.style.display = 'none';

        setTimeout(() => {
            if (dlnaLoading) dlnaLoading.style.display = 'none';
            if (deviceList) deviceList.style.display = 'block';

            this.dlnaDeviceList.innerHTML = `
                <div class="dlna-empty">
                    <p class="dlna-empty-text">${i18n.t('dlna.no_device')}</p>
                    <p class="dlna-empty-hint">${i18n.t('dlna.no_device_hint')}</p>
                </div>
            `;

            if (this.dlnaDevices.length > 0) {
                this.renderDlnaDevices();
            }
        }, 2000);
    },

    renderDlnaDevices() {
        if (this.dlnaDevices.length === 0) {
            this.dlnaDeviceList.innerHTML = `
                <div class="dlna-empty">
                    <p class="dlna-empty-text">${i18n.t('dlna.no_device')}</p>
                    <p class="dlna-empty-hint">${i18n.t('dlna.no_device_hint')}</p>
                </div>
            `;
            return;
        }

        const readyLabel = i18n.t('dlna.device_ready');
        this.dlnaDeviceList.innerHTML = this.dlnaDevices.map((device, index) => `
            <div class="dlna-device-item" data-index="${index}">
                <div class="dlna-device-icon">
                    <i class="fas fa-tv"></i>
                </div>
                <div class="dlna-device-info">
                    <div class="dlna-device-name">${device.name}</div>
                    <div class="dlna-device-status">${device.status || readyLabel}</div>
                </div>
            </div>
        `).join('');

        const deviceItems = this.dlnaDeviceList.querySelectorAll('.dlna-device-item');
        deviceItems.forEach(item => {
            item.addEventListener('click', () => {
                deviceItems.forEach(d => d.classList.remove('selected'));
                item.classList.add('selected');
            });
        });
    },

    async connectDlnaDevice() {
        const selectedDevice = this.dlnaDeviceList.querySelector('.dlna-device-item.selected');

        if (!selectedDevice) {
            await this.showAlert(i18n.t('dlna.select_device_first'), 'warning', i18n.t('dialog.notice'));
            return;
        }

        const deviceIndex = parseInt(selectedDevice.dataset.index);
        const device = this.dlnaDevices[deviceIndex];

        console.log('连接DLNA设备:', device);
        await this.showAlert(i18n.t('dlna.connecting_msg', { name: device.name }), 'info', i18n.t('dlna.connecting_title'));
    },

    async showDlnaHelp() {
        await this.showAlert(i18n.t('dlna.help_guide_content'), 'info', i18n.t('dlna.help_guide_title'));
    },

    initDlna() {
        if (this.closeDlna) {
            this.closeDlna.addEventListener('click', () => this.hideDlnaDialog());
        }
        if (this.dlnaRefresh) {
            this.dlnaRefresh.addEventListener('click', () => this.refreshDlnaDevices());
        }
        if (this.dlnaConnect) {
            this.dlnaConnect.addEventListener('click', () => this.connectDlnaDevice());
        }
        if (this.dlnaHelp) {
            this.dlnaHelp.addEventListener('click', () => this.showDlnaHelp());
        }
        if (this.dlnaDialog) {
            this.dlnaDialog.querySelector('.dlna-overlay')?.addEventListener('click', () => this.hideDlnaDialog());
        }
        console.log('DLNA投屏初始化成功');
    }
};
