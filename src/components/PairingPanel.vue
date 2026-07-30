<script setup lang="ts">
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'
import QRCode from 'qrcode'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

export type PairingStage =
  | 'preparing'
  | 'host-offer'
  | 'host-scan'
  | 'guest-scan'
  | 'guest-answer'
  | 'connecting'
  | 'connected'
  | 'failed'

const props = defineProps<{
  open: boolean
  role: 'host' | 'guest'
  stage: PairingStage
  code: string
  status: string
  error: string
  roomName: string
  roomCode: string
  peerCount: number
}>()

const emit = defineEmits<{
  close: []
  scan: [code: string]
  scanAnswer: []
  newInvite: []
  retryGuest: []
}>()

const qrSource = ref('')
const video = ref<HTMLVideoElement | null>(null)
const manualCode = ref('')
const cameraActive = ref(false)
const cameraError = ref('')
const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 220 })
let controls: IScannerControls | null = null

const isScanner = computed(() => props.stage === 'host-scan' || props.stage === 'guest-scan')
const title = computed(() => {
  if (props.stage === 'preparing') return '正在生成安全配对信息'
  if (props.stage === 'host-offer') return '让玩家扫描邀请二维码'
  if (props.stage === 'host-scan') return '扫描玩家的应答二维码'
  if (props.stage === 'guest-scan') return '扫描房主的邀请二维码'
  if (props.stage === 'guest-answer') return '把应答二维码给房主扫描'
  if (props.stage === 'connected') return '点对点连接已建立'
  if (props.stage === 'failed') return '连接未能建立'
  return '正在建立点对点连接'
})

watch(
  () => props.code,
  async (code) => {
    qrSource.value = code
      ? await QRCode.toDataURL(code, {
          width: 420,
          margin: 2,
          errorCorrectionLevel: 'L',
          color: { dark: '#061a18', light: '#f4fffb' },
        })
      : ''
  },
  { immediate: true },
)

watch(
  () => props.stage,
  async () => {
    stopCamera()
    manualCode.value = ''
    cameraError.value = ''
    await nextTick()
  },
)

async function startCamera(): Promise<void> {
  if (!video.value || cameraActive.value) return
  cameraError.value = ''
  try {
    controls = await reader.decodeFromConstraints(
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
      video.value,
      (result) => {
        if (!result) return
        const code = result.getText()
        stopCamera()
        emit('scan', code)
      },
    )
    cameraActive.value = true
  } catch (error) {
    cameraError.value = error instanceof Error
      ? `无法打开摄像头：${error.message}`
      : '无法打开摄像头，请改用二维码图片或粘贴配对码'
  }
}

function stopCamera(): void {
  controls?.stop()
  controls = null
  cameraActive.value = false
  if (video.value?.srcObject) {
    for (const track of (video.value.srcObject as MediaStream).getTracks()) track.stop()
    video.value.srcObject = null
  }
}

async function scanImage(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const url = URL.createObjectURL(file)
  try {
    const result = await reader.decodeFromImageUrl(url)
    emit('scan', result.getText())
  } catch {
    cameraError.value = '没有在图片中识别到有效二维码'
  } finally {
    URL.revokeObjectURL(url)
    input.value = ''
  }
}

function submitManual(): void {
  if (manualCode.value.trim()) emit('scan', manualCode.value)
}

async function copyCode(): Promise<void> {
  await navigator.clipboard.writeText(props.code)
}

onBeforeUnmount(stopCamera)
</script>

<template>
  <Teleport to="body">
    <Transition name="pairing">
      <div v-if="open" class="pairing-backdrop" @click.self="$emit('close')">
        <section
          class="pairing-sheet lggc"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="'pairing-title'"
        >
          <header class="pairing-header">
            <div>
              <span class="pairing-kicker">
                <AppIcon name="qr" />
                {{ role === 'host' ? '房主设备' : '玩家设备' }}
              </span>
              <h2 id="pairing-title">{{ title }}</h2>
              <p v-if="roomName">{{ roomName }}<span v-if="roomCode"> · #{{ roomCode }}</span></p>
            </div>
            <button type="button" aria-label="关闭配对" @click="$emit('close')">×</button>
          </header>

          <div v-if="stage === 'preparing' || stage === 'connecting'" class="pairing-loading">
            <span class="pairing-spinner" />
            <strong>{{ status || '正在等待浏览器收集局域网连接信息…' }}</strong>
            <small>无需互联网，也不会把牌局发送到服务器</small>
          </div>

          <div v-else-if="stage === 'host-offer' || stage === 'guest-answer'" class="pairing-code-layout">
            <div class="qr-frame">
              <img v-if="qrSource" :src="qrSource" alt="离线配对二维码" />
              <span v-else class="pairing-spinner" />
              <i class="qr-corner qr-corner--a" />
              <i class="qr-corner qr-corner--b" />
              <i class="qr-corner qr-corner--c" />
              <i class="qr-corner qr-corner--d" />
            </div>
            <div class="pairing-instructions">
              <ol v-if="stage === 'host-offer'">
                <li><b>1</b><span><strong>玩家打开“加入牌局”</strong><small>选择扫码或导入二维码图片</small></span></li>
                <li><b>2</b><span><strong>玩家扫描此二维码</strong><small>设备会离线生成一个应答二维码</small></span></li>
                <li><b>3</b><span><strong>房主回扫玩家应答</strong><small>完成后玩家自动入座</small></span></li>
              </ol>
              <ol v-else>
                <li><b>1</b><span><strong>保持此页面打开</strong><small>二维码仅包含本次 WebRTC 应答</small></span></li>
                <li><b>2</b><span><strong>请房主点击“扫描应答”</strong><small>让房主扫描左侧二维码</small></span></li>
                <li><b>3</b><span><strong>等待自动入座</strong><small>建立连接后会直接进入牌桌</small></span></li>
              </ol>
              <p class="pairing-status"><i />{{ status }}</p>
              <div class="pairing-code-actions">
                <button type="button" class="glass-button" @click="copyCode">
                  <AppIcon name="copy" /> 复制配对码
                </button>
                <button
                  v-if="stage === 'host-offer'"
                  type="button"
                  class="primary-action primary-action--violet"
                  @click="$emit('scanAnswer')"
                >
                  <AppIcon name="camera" /> 扫描玩家应答
                </button>
              </div>
              <details>
                <summary>无法扫码？显示文本配对码</summary>
                <textarea aria-label="当前配对码" readonly :value="code" />
              </details>
            </div>
          </div>

          <div v-else-if="isScanner" class="pairing-scanner-layout">
            <div class="scanner-frame" :class="{ active: cameraActive }">
              <video ref="video" muted playsinline />
              <div v-if="!cameraActive" class="scanner-placeholder">
                <AppIcon name="camera" />
                <strong>摄像头尚未启动</strong>
                <small>权限只用于本次二维码识别</small>
              </div>
              <span v-else class="scanner-line" />
            </div>
            <div class="scanner-actions">
              <button class="primary-action primary-action--green" type="button" @click="startCamera">
                <AppIcon name="camera" /> {{ cameraActive ? '正在扫描…' : '打开摄像头' }}
              </button>
              <label class="glass-button file-scan-button">
                <AppIcon name="image" /> 选择二维码图片
                <input type="file" accept="image/png,image/jpeg,image/webp" @change="scanImage" />
              </label>
              <div class="manual-pairing">
                <span>或粘贴配对码</span>
                <textarea
                  v-model="manualCode"
                  aria-label="粘贴配对码"
                  placeholder="GH1.…"
                  @keydown.ctrl.enter.prevent="submitManual"
                />
                <button type="button" :disabled="!manualCode.trim()" @click="submitManual">读取配对码</button>
              </div>
              <p v-if="cameraError || error" class="pairing-error"><AppIcon name="alert" />{{ cameraError || error }}</p>
            </div>
          </div>

          <div v-else-if="stage === 'failed'" class="pairing-failure">
            <span><AppIcon name="alert" /></span>
            <h3>连接失败</h3>
            <p>{{ error || '未能建立点对点连接，请重新尝试' }}</p>
            <ul>
              <li>确认两台设备连接到同一个 Wi-Fi 或手机热点</li>
              <li>在系统设置中允许浏览器访问本地网络</li>
              <li>访客 Wi-Fi 的“客户端隔离”可能会阻止设备互访</li>
            </ul>
            <div>
              <button
                class="primary-action primary-action--green"
                type="button"
                @click="role === 'host' ? $emit('newInvite') : $emit('retryGuest')"
              >
                <AppIcon :name="role === 'host' ? 'qr' : 'camera'" />
                {{ role === 'host' ? '生成新邀请' : '重新扫描邀请' }}
              </button>
              <button class="glass-button" type="button" @click="$emit('close')">关闭</button>
            </div>
          </div>

          <div v-else-if="stage === 'connected'" class="pairing-success">
            <span><AppIcon name="check" /></span>
            <h3>连接成功</h3>
            <p>{{ status }}</p>
            <div>
              <button v-if="role === 'host'" class="primary-action primary-action--green" type="button" @click="$emit('newInvite')">
                <AppIcon name="qr" /> 继续邀请玩家
              </button>
              <button class="glass-button" type="button" @click="$emit('close')">返回牌桌</button>
            </div>
          </div>

          <footer class="pairing-footer">
            <span><i /> 端到端加密</span>
            <span>无需账号</span>
            <span>无需 Node 或信令服务器</span>
            <span v-if="peerCount">{{ peerCount }} 台设备已连接</span>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
