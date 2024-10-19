import { createCanvas, loadImage } from 'canvas';

export async function createWordImage(word, width = 1060, height = 596) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const background = await loadImage('https://files.catbox.moe/rbz6no.jpg');
  ctx.drawImage(background, 0, 0, width, height);

  ctx.font = '80px DejaVu Sans Bold';
  ctx.fillStyle = 'black';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const hiddenWord = createHiddenWord(word);
  ctx.fillText(hiddenWord, width / 2, height / 2);

  return canvas.toBuffer();
}

export async function createEquationImage(equation, width = 1060, height = 596) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const background = await loadImage('https://files.catbox.moe/rbz6no.jpg');
  ctx.drawImage(background, 0, 0, width, height);

  ctx.font = '80px DejaVu Sans Bold';
  ctx.fillStyle = 'black';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillText(equation, width / 2, height / 2);

  return canvas.toBuffer();
}

function createHiddenWord(word) {
  if (word.length <= 4) {
    return `${word[0]} ${'_ '.repeat(word.length - 2)}${word[word.length - 1]}`;
  } else if (word.length <= 6) {
    const middle = Math.floor(word.length / 2);
    return `${word[0]} ${'_ '.repeat(middle - 1)}${word[middle]} ${'_ '.repeat(word.length - middle - 2)}${word[word.length - 1]}`;
  } else {
    const third = Math.floor(word.length / 3);
    const twoThirds = 2 * third;
    return `${word[0]} ${'_ '.repeat(third - 1)}${word[third]} ${'_ '.repeat(third - 1)}${word[twoThirds]} ${'_ '.repeat(word.length - twoThirds - 2)}${word[word.length - 1]}`;
  }
}