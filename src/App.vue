<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue'
import Footer from './components/Footer.vue'
import DiceRoll from './components/DiceRoll.vue'
</script>

<template>
  <div class="mx-auto flex min-h-screen w-full flex-col items-center justify-center gap-5 bg-zinc-900">
    <HelloWorld />
    <DiceRoll />
    <Footer />
  </div>
</template>
