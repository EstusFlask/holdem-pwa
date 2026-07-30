<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'

defineEmits<{ back: [] }>()

const section = ref('flow')
const rankings = [
  { name: '皇家同花顺', cards: 'A K Q J 10', description: '同一花色的 A 到 10' },
  { name: '同花顺', cards: '9 8 7 6 5', description: '同一花色的五张连续牌' },
  { name: '四条', cards: 'Q Q Q Q 7', description: '四张同点数牌' },
  { name: '葫芦', cards: '10 10 10 7 7', description: '三条加一对' },
  { name: '同花', cards: 'K J 8 5 2', description: '同一花色、点数不连续' },
  { name: '顺子', cards: '9 8 7 6 5', description: '五张连续牌；A 可作最小牌组成 A‑2‑3‑4‑5' },
  { name: '三条', cards: '8 8 8 K 4', description: '三张同点数牌' },
  { name: '两对', cards: 'A A 6 6 9', description: '两个不同对子' },
  { name: '一对', cards: 'J J A 7 3', description: '两张同点数牌' },
  { name: '高牌', cards: 'A J 9 6 3', description: '没有组成以上牌型' },
]
</script>

<template>
  <section class="rules-view">
    <header class="rules-header">
      <button class="glass-button glass-button--quiet" type="button" @click="$emit('back')"><AppIcon name="back" />返回</button>
      <div><h1>德州扑克规则</h1><p>本应用采用无限注（No‑Limit）朋友局规则</p></div>
      <span>2–10 人 · 52 张牌</span>
    </header>

    <div class="rules-shell">
      <nav class="rules-nav">
        <button type="button" :class="{ active: section === 'flow' }" @click="section = 'flow'">一手牌的流程</button>
        <button type="button" :class="{ active: section === 'actions' }" @click="section = 'actions'">行动与下注</button>
        <button type="button" :class="{ active: section === 'ranking' }" @click="section = 'ranking'">牌型大小</button>
        <button type="button" :class="{ active: section === 'allin' }" @click="section = 'allin'">全下与边池</button>
        <button type="button" :class="{ active: section === 'heads-up' }" @click="section = 'heads-up'">单挑与细则</button>
      </nav>

      <article class="rules-content lggc">
        <template v-if="section === 'flow'">
          <h2>一手牌的流程</h2>
          <p>每名玩家获得两张只有自己可见的底牌，牌桌随后最多发出五张公共牌。你可以使用七张可用牌中的任意五张组成最佳牌型；不要求必须使用底牌。</p>
          <ol class="round-timeline">
            <li><b>1</b><div><strong>盲注与底牌</strong><p>按钮左侧依次投入小盲和大盲。每人发两张底牌，从大盲左侧开始翻牌前下注。</p></div></li>
            <li><b>2</b><div><strong>翻牌 Flop</strong><p>烧一张牌，发三张公共牌，然后从按钮左侧第一位仍在牌局中的玩家开始下注。</p></div></li>
            <li><b>3</b><div><strong>转牌 Turn</strong><p>再烧一张牌并发第四张公共牌，进行第三轮下注。</p></div></li>
            <li><b>4</b><div><strong>河牌 River</strong><p>再烧一张牌并发第五张公共牌，进行最后一轮下注。</p></div></li>
            <li><b>5</b><div><strong>摊牌 Showdown</strong><p>若仍有两人或以上，比较最佳五张牌；同牌型按构成牌与踢脚牌逐级比较。</p></div></li>
          </ol>
        </template>

        <template v-else-if="section === 'actions'">
          <h2>行动与无限注下注</h2>
          <div class="rule-definitions">
            <div><strong>过牌 Check</strong><p>当前轮无人下注时不投入筹码，把行动交给下一位。</p></div>
            <div><strong>下注 Bet</strong><p>当前轮尚无下注时投入筹码。最小下注通常为一个大盲。</p></div>
            <div><strong>跟注 Call</strong><p>补足到当前最高下注；筹码不足时投入全部筹码并进入全下。</p></div>
            <div><strong>加注 Raise</strong><p>先跟平再增加下注。完整加注额不得小于上一笔完整下注或加注的增量。</p></div>
            <div><strong>弃牌 Fold</strong><p>放弃本手以及已经投入底池的筹码。</p></div>
            <div><strong>全下 All‑in</strong><p>投入当前全部筹码。无限注中最大下注就是玩家剩余筹码。</p></div>
          </div>
          <div class="rule-callout"><AppIcon name="info" /><p>一轮下注在所有仍可行动的玩家都已行动，并且投入相同筹码（或已全下）后结束。未达到最小加注额的短码全下不会重新开放已完成行动玩家的加注权。</p></div>
        </template>

        <template v-else-if="section === 'ranking'">
          <h2>牌型大小</h2>
          <p>从强到弱排列。相同牌型依次比较最关键的点数，再比较剩余踢脚牌；所有五张牌完全相同则平分底池。</p>
          <div class="ranking-list">
            <div v-for="(rank, index) in rankings" :key="rank.name">
              <b>{{ index + 1 }}</b>
              <strong>{{ rank.name }}</strong>
              <span>{{ rank.cards }}</span>
              <p>{{ rank.description }}</p>
            </div>
          </div>
        </template>

        <template v-else-if="section === 'allin'">
          <h2>全下、主池与边池</h2>
          <p>玩家不会因为筹码不足以跟注而被迫弃牌。全下玩家只参与自己已经匹配的那部分底池，之后其他玩家继续投入的筹码形成一个或多个边池。</p>
          <div class="side-pot-example">
            <div><strong>A 全下 100</strong><span>可争夺主池</span></div>
            <div><strong>B 投入 300</strong><span>主池 + 边池</span></div>
            <div><strong>C 投入 300</strong><span>主池 + 边池</span></div>
            <p>主池为 300；B 与 C 额外各投入 200，形成 400 的边池。先按各池有资格的玩家分别比较牌型。</p>
          </div>
          <div class="rule-callout"><AppIcon name="info" /><p>平分时无法整除的单枚筹码，按按钮左侧开始的顺时针顺序发给获胜者。本应用会自动创建、结算边池。</p></div>
        </template>

        <template v-else>
          <h2>单挑与执行细则</h2>
          <ul class="detail-list">
            <li><strong>两人单挑：</strong>按钮位投入小盲并在翻牌前先行动；大盲位在翻牌后各轮先行动。</li>
            <li><strong>按钮移动：</strong>每手结束后移动到下一名有筹码且在线的玩家。</li>
            <li><strong>烧牌：</strong>翻牌、转牌、河牌前各烧一张，烧牌不会展示给玩家。</li>
            <li><strong>提前获胜：</strong>若除一人外全部弃牌，剩余玩家直接获得底池，无需展示底牌。</li>
            <li><strong>断线：</strong>计时结束时，无需跟注则自动过牌，否则自动弃牌；房主断线会把房主权限转给下一名在线玩家。</li>
            <li><strong>公平随机：</strong>服务端使用 Node.js <code>crypto.randomInt</code> 执行无偏 Fisher–Yates 洗牌；离线练习使用 Web Crypto 拒绝采样。</li>
          </ul>
          <p class="rules-source">
            规则参考：
            <a href="https://www.pokerstars.com/poker/games/rules/" target="_blank" rel="noreferrer">PokerStars Poker Rules</a>
            与
            <a href="https://www.pokerstars.com/poker/learn/lesson/texas-holdem-rules/" target="_blank" rel="noreferrer">Texas Hold’em Rules</a>。
          </p>
        </template>
      </article>
    </div>
  </section>
</template>
