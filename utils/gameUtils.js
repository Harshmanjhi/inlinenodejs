export function generateEquation(level = Math.floor(Math.random() * 4) + 1) {
    let num1, num2, operator, answer;
  
    switch (level) {
      case 1:
        num1 = Math.floor(Math.random() * 20) + 1;
        num2 = Math.floor(Math.random() * 20) + 1;
        operator = ['+', '-', '*'][Math.floor(Math.random() * 3)];
        break;
      case 2:
        num1 = Math.floor(Math.random() * 50) + 1;
        num2 = Math.floor(Math.random() * 50) + 1;
        operator = ['+', '-', '*', '/'][Math.floor(Math.random() * 4)];
        break;
      case 3:
      case 4:
        num1 = Math.floor(Math.random() * 100) + 1;
        num2 = Math.floor(Math.random() * 10) + 1;
        operator = ['+', '-', '*', '/', '^'][Math.floor(Math.random() * 5)];
        break;
    }
  
    switch (operator) {
      case '+': answer = num1 + num2; break;
      case '-': answer = num1 - num2; break;
      case '*': answer = num1 * num2; break;
      case '/': 
        num1 = num1 * num2; // Ensure division results in an integer
        answer = num1 / num2;
        break;
      case '^': answer = Math.pow(num1, num2); break;
    }
  
    const problem = `${num1} ${operator} ${num2}`;
    return { problem, answer: answer.toString() };
  }
  
  export const RARITY_WEIGHTS = {
    "⚪️ Common": 12,
    "🟣 Rare": 0.2,
    "🟡 Legendary": 4.5,
    "🟢 Medium": 12,
    "💮 Special edition": 0.2,
    "🔮 Limited Edition": 0.1
  };
  
  export function weightedRandomSelect(items, weights) {
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    let randomWeight = Math.random() * totalWeight;
  
    for (const item of items) {
      const weight = weights[item.rarity] || 1;
      if (randomWeight < weight) return item;
      randomWeight -= weight;
    }
  
    return items[Math.floor(Math.random() * items.length)];
  }