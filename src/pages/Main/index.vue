<template>
  <main style="padding: 16px">
    <h1>ManyRoll</h1>
    <p>Вибери сторінку:</p>
    <ul>
      <li><RouterLink to="/3dDice">3dDice</RouterLink></li>
    </ul>
  </main>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>
