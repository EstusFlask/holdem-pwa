<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import AvatarBadge from '../components/AvatarBadge.vue'
import CardFace from '../components/CardFace.vue'
import {
  loadThemeRegistry,
  validateCardTheme,
  validateSingleAsset,
  type ThemeEntry,
  type ThemeRegistry,
  type ValidationResult,
} from '../services/assets'
import { imageFileToAvatar, type LocalProfile, type LocalSettings } from '../services/storage'
import type { Card } from '../game/types'

const props = defineProps<{
  profile: LocalProfile
  settings: LocalSettings
}>()

const emit = defineEmits<{
  back: []
  profileChange: [profile: LocalProfile]
  save: [settings: LocalSettings]
}>()

const section = ref<'profile' | 'appearance' | 'assets' | 'game' | 'about'>('assets')
const draft = reactive<LocalSettings>({ ...props.settings })
const profileDraft = reactive<LocalProfile>({ ...props.profile })
const registry = ref<ThemeRegistry>({ cards: [], backs: [], chips: [] })
const validations = reactive<Record<string, ValidationResult>>({})
const preview = ref<{ type: 'cards' | 'backs' | 'chips'; theme: ThemeEntry } | null>(null)
const loading = ref(true)
const cardPreview: Card[] = ['AS', 'KH', 'QC', 'JD']
const allCards: Card[] = (['S', 'H', 'D', 'C'] as const).flatMap((suit) =>
  (['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const)
    .map((rank) => `${rank}${suit}` as Card),
)
const baseUrl = import.meta.env.BASE_URL

function assetUrl(path: string | undefined, file: string): string {
  return `${baseUrl}${path ?? ''}/${file}`
}

function key(type: string, id: string): string {
  return `${type}:${id}`
}

function validation(type: string, id: string): ValidationResult | undefined {
  return validations[key(type, id)]
}

function selected(type: 'cards' | 'backs' | 'chips'): ThemeEntry | undefined {
  const id = type === 'cards' ? draft.cardTheme : type === 'backs' ? draft.backTheme : draft.chipTheme
  return registry.value[type].find((theme) => theme.id === id) ?? registry.value[type][0]
}

async function validateThemes(): Promise<void> {
  for (const theme of registry.value.cards) validations[key('cards', theme.id)] = await validateCardTheme(theme)
  for (const theme of registry.value.backs) validations[key('backs', theme.id)] = await validateSingleAsset(theme, 'back.svg')
  for (const theme of registry.value.chips) validations[key('chips', theme.id)] = await validateSingleAsset(theme, 'chips.svg')
}

function rotateTheme(type: 'cards' | 'backs' | 'chips', direction: number): void {
  const themes = registry.value[type]
  if (themes.length < 2) return
  const current = selected(type)
  const index = Math.max(0, themes.findIndex((theme) => theme.id === current?.id))
  const next = themes[(index + direction + themes.length) % themes.length]
  if (!validation(type, next.id)?.valid) return
  if (type === 'cards') draft.cardTheme = next.id
  else if (type === 'backs') draft.backTheme = next.id
  else draft.chipTheme = next.id
}

function resetDefaults(): void {
  draft.cardTheme = 'default'
  draft.backTheme = 'default'
  draft.chipTheme = 'default'
}

async function selectAvatar(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  profileDraft.avatar = await imageFileToAvatar(file)
  input.value = ''
}

function saveProfile(): void {
  const name = profileDraft.name.trim().slice(0, 16)
  if (!name) return
  emit('profileChange', { ...profileDraft, name })
}

onMounted(async () => {
  try {
    registry.value = await loadThemeRegistry()
    await validateThemes()
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="settings-view">
    <header class="settings-header">
      <button class="glass-button glass-button--quiet" type="button" @click="$emit('back')">
        <AppIcon name="back" /> 返回
      </button>
      <h1>设置</h1>
      <span class="settings-saved"><AppIcon name="check" /> 本机设置</span>
    </header>

    <div class="settings-shell">
      <aside class="settings-sidebar">
        <div class="settings-profile-mini">
          <AvatarBadge :name="profile.name" :src="profile.avatar" size="medium" />
          <strong>{{ profile.name }}</strong>
          <span>仅保存在本机</span>
        </div>
        <nav>
          <button type="button" :class="{ active: section === 'profile' }" @click="section = 'profile'"><AppIcon name="profile" />个人资料</button>
          <button type="button" :class="{ active: section === 'appearance' }" @click="section = 'appearance'"><AppIcon name="palette" />外观</button>
          <button type="button" :class="{ active: section === 'assets' }" @click="section = 'assets'"><AppIcon name="cards" />牌组与筹码</button>
          <button type="button" :class="{ active: section === 'game' }" @click="section = 'game'"><AppIcon name="gamepad" />游戏</button>
          <button type="button" :class="{ active: section === 'about' }" @click="section = 'about'"><AppIcon name="info" />关于</button>
        </nav>
      </aside>

      <div class="settings-content">
        <template v-if="section === 'assets'">
          <div class="section-heading">
            <h2>牌组与筹码</h2>
            <p>预览并切换本机素材，不影响其他玩家</p>
          </div>

          <div v-if="loading" class="settings-loading">正在校验素材…</div>
          <div v-else class="asset-selectors">
            <article v-if="selected('cards')" class="asset-row asset-row--selected">
              <div class="asset-row-copy">
                <span>扑克牌牌面</span>
                <strong>{{ selected('cards')?.name }}</strong>
                <p
                  :class="{ invalid: !validation('cards', selected('cards')!.id)?.valid }"
                >
                  <AppIcon :name="validation('cards', selected('cards')!.id)?.valid ? 'check' : 'alert'" />
                  <template v-if="validation('cards', selected('cards')!.id)?.valid">52 张 · 校验通过</template>
                  <template v-else>{{ validation('cards', selected('cards')!.id)?.errors[0] ?? '校验失败' }}</template>
                </p>
              </div>
              <div class="card-fan">
                <CardFace
                  v-for="card in cardPreview"
                  :key="card"
                  :card="card"
                  :card-theme="selected('cards')?.id"
                />
              </div>
              <div class="asset-row-actions">
                <button type="button" @click="preview = { type: 'cards', theme: selected('cards')! }"><AppIcon name="eye" />预览</button>
                <div>
                  <button type="button" :disabled="registry.cards.length < 2" @click="rotateTheme('cards', -1)"><AppIcon name="chevron-left" /></button>
                  <button type="button" :disabled="registry.cards.length < 2" @click="rotateTheme('cards', 1)"><AppIcon name="chevron-right" /></button>
                </div>
              </div>
            </article>

            <article v-if="selected('backs')" class="asset-row">
              <div class="asset-row-copy">
                <span>牌背</span>
                <strong>{{ selected('backs')?.name }}</strong>
                <p :class="{ invalid: !validation('backs', selected('backs')!.id)?.valid }">
                  <AppIcon :name="validation('backs', selected('backs')!.id)?.valid ? 'check' : 'alert'" />
                  {{ validation('backs', selected('backs')!.id)?.valid ? '素材校验通过' : validation('backs', selected('backs')!.id)?.errors[0] }}
                </p>
              </div>
              <div class="back-preview">
                <CardFace hidden :back-theme="selected('backs')?.id" />
                <CardFace hidden :back-theme="selected('backs')?.id" />
              </div>
              <div class="asset-row-actions">
                <button type="button" @click="preview = { type: 'backs', theme: selected('backs')! }"><AppIcon name="eye" />预览</button>
                <div>
                  <button type="button" :disabled="registry.backs.length < 2" @click="rotateTheme('backs', -1)"><AppIcon name="chevron-left" /></button>
                  <button type="button" :disabled="registry.backs.length < 2" @click="rotateTheme('backs', 1)"><AppIcon name="chevron-right" /></button>
                </div>
              </div>
            </article>

            <article v-if="selected('chips')" class="asset-row">
              <div class="asset-row-copy">
                <span>筹码</span>
                <strong>{{ selected('chips')?.name }}</strong>
                <p :class="{ invalid: !validation('chips', selected('chips')!.id)?.valid }">
                  <AppIcon :name="validation('chips', selected('chips')!.id)?.valid ? 'check' : 'alert'" />
                  {{ validation('chips', selected('chips')!.id)?.valid ? '素材校验通过' : validation('chips', selected('chips')!.id)?.errors[0] }}
                </p>
              </div>
              <img class="chip-preview" :src="assetUrl(selected('chips')?.path, 'chips.svg')" alt="筹码预览" />
              <div class="asset-row-actions">
                <button type="button" @click="preview = { type: 'chips', theme: selected('chips')! }"><AppIcon name="eye" />预览</button>
                <div>
                  <button type="button" :disabled="registry.chips.length < 2" @click="rotateTheme('chips', -1)"><AppIcon name="chevron-left" /></button>
                  <button type="button" :disabled="registry.chips.length < 2" @click="rotateTheme('chips', 1)"><AppIcon name="chevron-right" /></button>
                </div>
              </div>
            </article>
          </div>

          <div class="settings-footer-actions">
            <button class="glass-button" type="button" @click="resetDefaults"><AppIcon name="refresh" />恢复默认</button>
            <button class="primary-action primary-action--green" type="button" @click="$emit('save', { ...draft })"><AppIcon name="check" />保存设置</button>
          </div>
        </template>

        <template v-else-if="section === 'profile'">
          <div class="section-heading"><h2>个人资料</h2><p>名字和头像会缓存到这台设备</p></div>
          <div class="profile-settings-card lggc">
            <label class="avatar-uploader">
              <AvatarBadge :name="profileDraft.name" :src="profileDraft.avatar" size="large" />
              <span><AppIcon name="upload" /></span>
              <input type="file" accept="image/png,image/jpeg,image/webp" @change="selectAvatar" />
            </label>
            <label class="field"><span>显示名字</span><input v-model="profileDraft.name" maxlength="16" /></label>
            <button class="primary-action primary-action--green" type="button" @click="saveProfile">保存个人资料</button>
          </div>
        </template>

        <template v-else-if="section === 'appearance'">
          <div class="section-heading"><h2>外观</h2><p>保持清晰、舒适的牌桌动效</p></div>
          <label class="setting-toggle lggc">
            <span><strong>减少动态效果</strong><small>关闭大多数过渡与光泽动画</small></span>
            <input v-model="draft.reduceMotion" type="checkbox" />
          </label>
        </template>

        <template v-else-if="section === 'game'">
          <div class="section-heading"><h2>游戏</h2><p>仅调整当前设备上的体验</p></div>
          <label class="setting-toggle lggc">
            <span><strong>操作提示音</strong><small>轮到你行动时播放轻提示</small></span>
            <input v-model="draft.sound" type="checkbox" />
          </label>
        </template>

        <template v-else>
          <div class="section-heading"><h2>关于 Glass Hold’em</h2><p>本地优先、无真实货币、面向朋友聚会</p></div>
          <div class="about-panel lggc">
            <img :src="assetUrl('icons', 'icon-192.png')" alt="" />
            <div><strong>Glass Hold’em 1.0</strong><p>Vue 3 · PWA · WebRTC · Web Crypto</p></div>
          </div>
        </template>
      </div>
    </div>

    <div v-if="preview" class="preview-scrim" @click.self="preview = null">
      <aside class="asset-preview-drawer lggc">
        <header>
          <div><strong>{{ preview.type === 'cards' ? '扑克牌牌面' : preview.type === 'backs' ? '牌背' : '筹码' }}预览 · {{ preview.theme.name }}</strong><span>{{ preview.theme.license }}</span></div>
          <button type="button" aria-label="关闭预览" @click="preview = null">×</button>
        </header>
        <div v-if="preview.type === 'cards'" class="full-deck-preview">
          <CardFace v-for="card in allCards" :key="card" :card="card" :card-theme="preview.theme.id" />
        </div>
        <div v-else-if="preview.type === 'backs'" class="large-back-preview">
          <CardFace hidden :back-theme="preview.theme.id" />
          <CardFace hidden :back-theme="preview.theme.id" />
        </div>
        <img v-else class="large-chip-preview" :src="assetUrl(preview.theme.path, 'chips.svg')" alt="筹码完整预览" />
        <footer><AppIcon name="info" />预览模式不会保存任何更改</footer>
      </aside>
    </div>
  </section>
</template>
