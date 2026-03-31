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
  <div class="roller-container">
    <h1>D&D 5e Mass Roller</h1>

    <div class="setup-panel">
      <div class="field">
        <label>Количество юнитов:</label>
        <input type="number" v-model.number="unitCount" min="1">
      </div>

      <div class="field">
        <label>
          <input type="checkbox" v-model="isCheckRoll"> Бросок проверки (d20)
        </label>
      </div>

      <div class="field" v-if="isCheckRoll">
        <label>Сложность (DC):</label>
        <input type="number" v-model.number="difficulty">
      </div>

      <div class="field">
        <span>Модификатор:</span>
        <div class="radio-group">
          <label><input type="radio" value="none" v-model="advantage"> Нет</label>
          <label><input type="radio" value="adv" v-model="advantage"> Преимущество</label>
          <label><input type="radio" value="dis" v-model="advantage"> Помеха</label>
        </div>
      </div>

      <div class="field" v-if="!isCheckRoll">
        <p>Настроить пул костей:</p>
        <div class="dice-buttons">
          <button v-for="d in availableDice" :key="d" @click="addDieToPool(d)">
            d{{ d }}
          </button>
          <button class="btn-clear" @click="clearPool">Очистить ({{ globalPool.length }})</button>
        </div>
        <div class="pool-preview">
          Текущий пул: {{ globalPool.map(d => 'd' + d).join(', ') || 'пусто' }}
        </div>
      </div>

      <button class="btn-roll" @click="rollAll">БРОСИТЬ ЗА ВСЕХ</button>
    </div>

    <div class="results-grid">
      <div 
        v-for="(unit, index) in units" 
        :key="index" 
        class="unit-card"
        :class="{ 
          'success': isCheckRoll && unit.isSuccess, 
          'failure': isCheckRoll && unit.isSuccess === false 
        }"
      >
        <div class="unit-header">Юнит #{{ index + 1 }}</div>
        
        <div class="dice-results">
          <div v-for="(res, rIdx) in unit.results" :key="rIdx" class="die-box">
            <span class="die-val">{{ res.val }}</span>
            <small v-if="res.sides">d{{ res.sides }}</small>
            <small v-if="res.details">{{ res.details }}</small>
          </div>
        </div>
        
        <div class="unit-footer">
          <strong>Всего: {{ unit.total }}</strong>
          <span v-if="isCheckRoll" class="status-tag">
            {{ unit.isSuccess ? 'УСПЕХ' : 'ПРОВАЛ' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.roller-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  font-family: sans-serif;
  background: #1e1e1e;
  color: #e0e0e0;
  border-radius: 12px;
}

.setup-panel {
  background: #2d2d2d;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.field {
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #3d3d3d;
}

.radio-group {
  display: flex;
  gap: 15px;
  margin-top: 5px;
}

.dice-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
}

button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  background: #4a90e2;
  color: white;
  cursor: pointer;
}

button:hover {
  background: #357abd;
}

.btn-clear { background: #666; }
.btn-roll {
  width: 100%;
  padding: 15px;
  font-weight: bold;
  font-size: 1.1rem;
  background: #e74c3c;
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 15px;
}

.unit-card {
  background: #333;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #444;
}

.unit-card.success { border-left: 6px solid #2ecc71; }
.unit-card.failure { border-left: 6px solid #e74c3c; }

.die-box {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  background: white;
  color: #222;
  margin: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  min-width: 40px;
}

.die-val { font-weight: bold; font-size: 1.2rem; }

.unit-footer {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-tag {
  font-size: 0.8rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255,255,255,0.1);
}
</style>