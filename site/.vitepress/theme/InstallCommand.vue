<script setup>
import { ref } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  copied: { type: String, default: 'Copied!' },
  copyLabel: { type: String, default: 'Copy' },
  commands: {
    type: Array,
    default: () => [],
    // each entry: { c: 'comment line' } or { cmd: 'the command' }
  },
})

const buttonText = ref(props.copyLabel)
let resetTimer = null

const cmdLines = () => props.commands.filter((x) => typeof x.cmd === 'string').map((x) => x.cmd)

async function copy() {
  const text = cmdLines().join(' && ')
  let shown = text
  try {
    await navigator.clipboard.writeText(text)
    shown = props.copied
  } catch {
    // clipboard unavailable — surface the text so the user can copy by hand
    shown = text
  }
  buttonText.value = shown
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    buttonText.value = props.copyLabel
  }, 1600)
}
</script>

<template>
  <div class="install">
    <div class="install-head">
      <span>{{ label }}</span>
      <button type="button" @click="copy">{{ buttonText }}</button>
    </div>
    <pre><template v-for="(line, i) in commands" :key="i"><span v-if="line.c !== undefined" class="c"># {{ line.c }}</span><span v-else class="p">$</span> {{ line.cmd }}
</template></pre>
  </div>
</template>
