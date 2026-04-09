<script setup>
import { ref, computed } from 'vue';

// --- Класс Unit (Логика) ---
class Unit {
  constructor(dc = 10, advantageType = 'none') {
    this.dc = dc;
    this.advantageType = advantageType; // 'none', 'adv', 'dis'
    this.dicePool = []; // Пул костей (массив номиналов)
    this.results = [];  // Результаты бросков
    this.isSuccess = null;
    this.total = 0;
  }

  // Метод добавления кости (одной из 7)
  addDie(sides) {
    this.dicePool.push(sides);
  }

  // Метод случайного подсчёта
  roll() {
    const rollDie = (s) => Math.floor(Math.random() * s) + 1;
    this.results = [];
    this.total = 0;

    // Если это бросок проверки (используем только d20 по правилам 5е)
    if (this.dicePool.length === 1 && this.dicePool[0] === 20 && this.dc > 0) {
      const r1 = rollDie(20);
      const r2 = rollDie(20);
      
      let final;
      if (this.advantageType === 'adv') {
        final = Math.max(r1, r2);
        this.results.push({ val: final, details: `(${r1}, ${r2})` });
      } else if (this.advantageType === 'dis') {
        final = Math.min(r1, r2);
        this.results.push({ val: final, details: `(${r1}, ${r2})` });
      } else {
        final = r1;
        this.results.push({ val: final });
      }
      
      this.total = final;
      this.isSuccess = final >= this.dc;
    } else {
      // Обычный набор костей
      this.dicePool.forEach(sides => {
        const val = rollDie(sides);
        this.results.push({ sides, val });
        this.total += val;
      });
    }
  }
}

// --- Состояние интерфейса ---
const unitCount = ref(1);
const isCheckRoll = ref(false);
const difficulty = ref(10);
const advantage = ref('none'); // 'none', 'adv', 'dis'
const globalPool = ref([]); // Временный пул для настройки
const units = ref([]); // Массив юнитов с результатами
const viewMode = ref<'dice' | 'table'>('dice'); // 'dice', 'table'

const availableDice = [4, 6, 8, 10, 12, 20, 100];

// --- Методы ---
const addDieToPool = (sides) => {
  globalPool.value.push(sides);
};

const clearPool = () => {
  globalPool.value = [];
};

const rollAll = () => {
  const newUnits = [];
  
  for (let i = 0; i < unitCount.value; i++) {
    const u = new Unit(difficulty.value, advantage.value);
    
    if (isCheckRoll.value) {
      u.addDie(20); // Для проверки всегда d20
    } else {
      globalPool.value.forEach(d => u.addDie(d));
    }
    
    u.roll();
    newUnits.push(u);
  }
  
  units.value = newUnits;
};
</script>

<template>
  <div class="w-full max-w-5xl p-5 text-zinc-200 shadow-lg mx-auto">
    <div class="mb-5 rounded-lg bg-zinc-800 p-5">
      <div class="mb-4 border-b border-zinc-700 pb-2.5">
        <label class="mb-1 block text-sm font-medium text-zinc-200">Количество юнитов:</label>
        <input
          v-model.number="unitCount"
          type="number"
          min="1"
          class="w-28 rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none ring-purple-400 transition focus:ring-2"
        >
      </div>

      <div class="mb-4 border-b border-zinc-700 pb-2.5">
        <label class="inline-flex items-center gap-2 text-sm text-zinc-100">
          <input v-model="isCheckRoll" type="checkbox" class="h-4 w-4 accent-purple-500"> Бросок проверки (d20)
        </label>
      </div>

      <div v-if="isCheckRoll" class="mb-4 border-b border-zinc-700 pb-2.5">
        <label class="mb-1 block text-sm font-medium text-zinc-200">Сложность (DC):</label>
        <input
          v-model.number="difficulty"
          type="number"
          class="w-28 rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none ring-purple-400 transition focus:ring-2"
        >
      </div>

      <div v-if="isCheckRoll" class="mb-4 border-b border-zinc-700 pb-2.5">
        <span class="mb-2 block text-sm font-medium text-zinc-200">Модификатор:</span>
        <div class="mt-1 flex flex-wrap gap-4">
          <label class="inline-flex items-center gap-1.5 text-sm">
            <input v-model="advantage" type="radio" value="none" class="h-4 w-4 accent-purple-500"> Нет
          </label>
          <label class="inline-flex items-center gap-1.5 text-sm">
            <input v-model="advantage" type="radio" value="adv" class="h-4 w-4 accent-purple-500"> Преимущество
          </label>
          <label class="inline-flex items-center gap-1.5 text-sm">
            <input v-model="advantage" type="radio" value="dis" class="h-4 w-4 accent-purple-500"> Помеха
          </label>
        </div>
      </div>

      <div v-if="!isCheckRoll" class="mb-4 border-b border-zinc-700 pb-2.5">
        <p class="text-sm font-medium text-zinc-200">Настроить пул костей:</p>
        <div class="my-2.5 flex flex-wrap gap-2">
          <button
            v-for="d in availableDice"
            :key="d"
            class="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
            @click="addDieToPool(d)"
          >
            d{{ d }}
          </button>
          <button
            class="rounded-md bg-zinc-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-500"
            @click="clearPool"
          >
            Очистить ({{ globalPool.length }})
          </button>
        </div>
        <div class="text-sm text-zinc-300">
          Текущий пул: {{ globalPool.map(d => 'd' + d).join(', ') || 'пусто' }}
        </div>
      </div>

      <button
        class="w-full rounded-md bg-rose-500 px-4 py-3 text-base font-bold text-white transition hover:bg-rose-600"
        @click="rollAll"
      >
        БРОСИТЬ ЗА ВСЕХ
      </button>
    </div>

    <div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
      <div 
        v-for="(unit, index) in units" 
        :key="index" 
        class="rounded-lg border border-zinc-700 bg-zinc-800 p-4"
        :class="{ 
          'border-l-4 border-l-emerald-500': isCheckRoll && unit.isSuccess, 
          'border-l-4 border-l-rose-500': isCheckRoll && unit.isSuccess === false 
        }"
      >
        <div class="mb-2 text-sm font-semibold text-zinc-100">Юнит #{{ index + 1 }}</div>
        
        <div>
          <div
            v-for="(res, rIdx) in unit.results"
            :key="rIdx"
            class="my-1 mr-1 inline-flex min-w-10 flex-col items-center rounded bg-white px-2 py-1 text-zinc-900"
          >
            <span class="text-lg font-bold">{{ res.val }}</span>
            <small v-if="res.sides" class="text-xs text-zinc-700">d{{ res.sides }}</small>
            <small v-if="res.details" class="text-xs text-zinc-600">{{ res.details }}</small>
          </div>
        </div>
        
        <div class="mt-2.5 flex items-center justify-between">
          <strong>Всего: {{ unit.total }}</strong>
          <span v-if="isCheckRoll" class="rounded bg-white/10 px-1.5 py-0.5 text-xs">
            {{ unit.isSuccess ? 'УСПЕХ' : 'ПРОВАЛ' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
</style>