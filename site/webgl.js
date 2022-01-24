let canvas, gl, colorPos, matrixPos, whitePixelTexture, pixelWidth, pixelHeight, gameAreaWidth, gameAreaHeight;

/** Laskee pelialueen leveyden pikseleinä.
  @return Pelialueen leveys pikseleinä. */
function screenWidth() {
  return gameAreaWidth;
}

/** Laskee pelialueen korkeuden pikseleinä.
  @return Pelialueen korkeus pikseleinä. */
function screenHeight() {
  return gameAreaHeight;
}

function init() {
  canvas = document.createElement('canvas');
  canvas.addEventListener('click', onMouseClick);
  canvas.style.display = 'none';
  function recalculateGameAreaSize() {
    gameAreaWidth = canvas.width = window.innerWidth; // 800
    gameAreaHeight = canvas.height = window.innerHeight; // 450
    pixelWidth = 2 / gameAreaWidth;
    pixelHeight = gameAreaWidth / gameAreaHeight * pixelWidth;
    /*
    let scaleX = window.innerWidth / gameAreaWidth;
    let scaleY = window.innerHeight / gameAreaHeight;
    let scale = Math.min(scaleX, scaleY);
    let sizeX = gameAreaWidth*scale;
    let sizeY = gameAreaHeight*scale;
    canvas.style.paddingLeft = `${(window.innerWidth - sizeX) / 2}px`;
    canvas.style.paddingTop = `${(window.innerHeight - sizeY) / 2}px`;
    canvas.style.width = `${(sizeX).toFixed(2)}px`;
    canvas.style.height = `${(sizeY).toFixed(2)}px`;
    */
  }
  recalculateGameAreaSize();
  document.body.appendChild(canvas);
  document.body.style.margin = '0px';

  window.addEventListener('resize', () => {
    recalculateGameAreaSize();
  });

  gl = canvas.getContext('webgl');

  let vs = compileShader(gl.VERTEX_SHADER, `
            varying vec2 uv;
            attribute vec4 pos;
            uniform mat4 matrix;
            void main() {
              uv = pos.xy;
              gl_Position = matrix * pos;
            }`);

  let fs = compileShader(gl.FRAGMENT_SHADER, `
            precision lowp float;
            uniform sampler2D tex;
            varying vec2 uv;
            uniform vec4 color;
            void main() {
              gl_FragColor = color * texture2D(tex,uv);
            }`);

  let program = createProgram(vs, fs);
  colorPos = gl.getUniformLocation(program, 'color');
  matrixPos = gl.getUniformLocation(program, 'matrix');
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  let quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, gl.FALSE, 0, 0);
  gl.enableVertexAttribArray(0);

  whitePixelTexture = createTexture();
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
}

function testPointInAabb(x, y, abx0, aby0, abx1, aby1) {
  return x >= abx0 && y >= aby0 && x <= abx1 && y <= aby1;
}

/** Laskee törmäävätkö kaksi annettua objektia toisiinsa.
  @return true jos objektit törmäävät, muulloin false. */
function objectsCollide(a, b) {
  if (a.x0 > a.x1 || a.y0 > a.y1 || b.x0 > b.x1 || b.y0 > b.y1) throw 'asdf';
  return a.x0 < b.x1 && a.y0 < b.y1 && b.x0 < a.x1 && b.y0 < a.y1;
}

function testPointInSpriteMask(x, y, o) {
  let px = Math.floor((x - o.x0) / (o.x1 - o.x0) * o.texture.width);
  let py = Math.floor((o.y1 - y) / (o.y1 - o.y0) * o.texture.height);
  return o.texture.pixelMask[py*o.texture.width + px] > 127;
}

function onMouseClick(e) {
  let x = e.x;
  let y = screenHeight() - 1 - e.y;
  for(let i = clickStack.length-1; i >= 0; --i) {
    let o = clickStack[i];
    if (o.onclick && testPointInAabb(x, y, o.x0, o.y0, o.x1, o.y1)) {
      if (!o.texture || testPointInSpriteMask(x, y, o)) {
        o.onclick();
        return;
      }
    }
  }
}

init();

function compileShader(type, src) {
  let shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  let log = gl.getShaderInfoLog(shader);
  if (log) {
    console.error(log);
  }
  return shader;
}

function createProgram(vs, fs) {
  let program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, 'pos');
  gl.linkProgram(program);
  gl.useProgram(program);
  return program;
}

function createTexture() {
  let texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

let matrix = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1]);

function fillTexturedRectangle(x0, y0, x1, y1, r, g, b, a, texture) {
  matrix[0] = (x1 - x0) * pixelWidth;
  matrix[5] = (y1 - y0) * pixelHeight;
  matrix[12] = x0 * pixelWidth - 1;
  matrix[13] = y0 * pixelHeight - 1;

  gl.uniformMatrix4fv(matrixPos, false, matrix);
  gl.uniform4f(colorPos, r, g, b, a);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

let texturesFromUrl = {};

function calculatePixelMask(img) {
  let canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);
  let pixelData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let pixelMask = new Uint8Array(canvas.width * canvas.height);
  for(let i = 0; i < canvas.width*canvas.height; ++i) {
    pixelMask[i] = pixelData[4*i + 3];
  }
  return pixelMask;
}

function preloadImages(urls) {
  for(let url of urls) getOrLoadTextureFromUrl(url);
}

function getOrLoadTextureFromUrl(url) {
  if (texturesFromUrl[url] && texturesFromUrl[url].texture) return texturesFromUrl[url];
  if (texturesFromUrl[url]) return;
  if (!gl) return;
  let img = new Image();
  img.onload = () => {
    let texture = createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    texturesFromUrl[url] = {
      'texture': texture,
      'width': img.width,
      'height': img.height,
      'pixelMask': calculatePixelMask(img)
    };
  }
  img.onerror = () => {
    let texture = createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
    texturesFromUrl[url] = {
      'texture': texture,
      'width': 1,
      'height': 1
    };
  }
  img.src = url;
  texturesFromUrl[url] = img;
}

let advanceCache = {};

function measureTextXAdvance(ch1, ch2, size, font) {
  if (ch1 == ' ') ch1 = 'i'; // replace spaces with 'i' character to be able to measure their advance with fillText()
  if (ch2 == ' ') ch2 = 'i';

  let key = `${ch1}_${ch2}_${size}_${font}`;
  if (advanceCache[key]) return advanceCache[key];

  for(let canvasFactor = 1; canvasFactor <= 16; canvasFactor *= 2) {
    let glyphCanvas = document.createElement("canvas");
    let glyphContext = glyphCanvas.getContext("2d");
    glyphContext['globalCompositeOperator'] = 'copy';
    let canvasSize = size * canvasFactor;
    glyphContext.globalAlpha = 1;
    glyphContext.fillStyle = 'white';
    glyphCanvas.width = glyphCanvas.height = canvasSize;
    glyphCanvas.height = canvasSize;

    var w = glyphCanvas.width = canvasSize * 2;
    var offset = canvasSize*0.1;

    glyphContext.font = `${size}px ${font}`;

    function getPixelAdvance() {
      var d = new Uint32Array(glyphContext.getImageData(0, 0, w, glyphCanvas.height).data.buffer);
      for(var x = w-1; x > 0; --x) {
        for(var i = x; i < d.length; i += w) {
          if (d[i]) return x;
        }
      }
    }

    glyphContext.fillText(ch2, offset, canvasSize - offset);
    var advance1 = getPixelAdvance();
    glyphContext.fillText(ch1 + ch2, offset, canvasSize - offset);
    var advance2 = getPixelAdvance();
    if (advance2 != w-1) {
      return advanceCache[key] = advance2 - advance1;
    }
  }
}

function cacheFontGlyph(ch, font, size) {
  let key = `font_${ch}_${font}_${size}`;
  if (texturesFromUrl[key] && texturesFromUrl[key].texture) return texturesFromUrl[key];
  if (texturesFromUrl[key]) return;
  if (!gl) return;

  let glyphCanvas = document.createElement("canvas");
  let glyphContext = glyphCanvas.getContext("2d");
  glyphContext['globalCompositeOperator'] = 'copy';
  let canvasFactor = 1;
  let canvasSize = size * canvasFactor;
  glyphCanvas.width = glyphCanvas.height = canvasSize;
  glyphContext.globalAlpha = 1;
  glyphContext.fillStyle = 'white';
  glyphContext.font = `${size}px ${font}`;

  glyphContext.shadowColor = 'saddlebrown';
  glyphContext.shadowBlur = 5;
  glyphContext.shadowOffsetX = 5;
  glyphContext.shadowOffsetY = 5;

  var offset = canvasSize*0.1;
  glyphContext.fillText(ch, offset, canvasSize - offset);

  let imageUrl = glyphCanvas.toDataURL("image/png").replace("image/png", "image/octet-stream");  // here is the most important part because if you dont replace you will get a DOM 18 exception.
  let img = new Image();
  img.onload = () => {
    let texture = createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    texturesFromUrl[key] = {
      'texture': texture,
      'width': glyphCanvas.width,
      'height': glyphCanvas.height,
      'pixelMask': calculatePixelMask(img)
    };
  }
  img.src = imageUrl;
  texturesFromUrl[key] = img;
}

let clickStack = [];

/** Täyttää ruudun annetulla rgb-värillä.
 @param r Punainen väri väliltä 0.0 - 1.0.
 @param g Vihreä väri väliltä 0.0 - 1.0.
 @param b Sininen väri väliltä 0.0 - 1.0. */
function clearScreen(r, g, b) {
  if (!gl) return;
  gl.clearColor(r, g, b, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  clickStack = [];
}

/** Piirtää suorakaiteen annetulla rgb-värillä.
 @param x0 Vasemman yläkulman x-koordinaatti.
 @param y0 Vasemman yläkulman y-koordinaatti.
 @param x1 Oikean alakulman x-koordinaatti.
 @param y1 Oikean alakulman y-koordinaatti.
 @param r Punainen väri väliltä 0.0 - 1.0.
 @param g Vihreä väri väliltä 0.0 - 1.0.
 @param b Sininen väri väliltä 0.0 - 1.0.
 @return Objektin joka kuvaa klikattavaa suorakaidetta. (ks. funktion drawImage paluuarvon dokumentaatio) */
function drawRectangle(x0, y0, x1, y1, r, g, b, a) {
  if (!gl) return;
  fillTexturedRectangle(x0, y0, x1, y1, r, g, b, a, whitePixelTexture);
  let clickableObject = {
    x0: x0,
    y0: y0,
    x1: x1,
    y1: y1
  };
  clickStack.push(clickableObject);
  return clickableObject;
}

/** Piirtää kuvatiedoston.
 @param url Kuvan URL-osoite (muodossa .jpg tai .png)
 @param x Kuvan x-koordinaatti.
 @param y Kuvan y-koordinaatti.
 @param r Punainen väri väliltä 0.0 - 1.0.
 @param g Vihreä väri väliltä 0.0 - 1.0.
 @param b Sininen väri väliltä 0.0 - 1.0.
 @param a Läpinäkyvyys väliltä 0.0 - 1.0.
 @return Objektin joka kuvaa klikattavaa kuvaa. Tälle objektille voi asettaa jäsenmuuttujaan .onclick funktion,
         joka suoritetaan jos käyttäjä klikkaa kuvaa hiirellä. Esimerkiksi:

         let g = drawImage('kuva.png', 5, 10);
         g.onlick = function() \{ console.log('Käyttäjä klikkasi kuvaa!'); \}  */
function drawImage(url, x, y, scaleX = 1, scaleY = undefined, centerX = 0, centerY = 0, r = 1, g = 1, b = 1, a = 1) {
  if (!gl) return {};
  if (scaleY === undefined) scaleY = scaleX;
  let texture = getOrLoadTextureFromUrl(url), clickableObject = {};
  if (texture) {
    let x0 = x - centerX * texture.width * scaleX;
    let y0 = y - centerY * texture.height * scaleY;
    let x1 = x + (1 - centerX) * texture.width * scaleX;
    let y1 = y + (1 - centerY) * texture.height * scaleY;
    fillTexturedRectangle(
      x0,
      y0,
      x1,
      y1,
      r, g, b, a, texture.texture);
    if (x0 > x1) { let s = x0; x0 = x1; x1 = s; }
    if (y0 > y1) { let s = y0; y0 = y1; y1 = s; }
    clickableObject = {
      x0: x0,
      y0: y0,
      x1: x1,
      y1: y1,
      texture: texture
    };
    clickStack.push(clickableObject);
  }

  return clickableObject;
}

function drawShadowImage(url, x, y, scaleX = 1, scaleY = undefined, centerX = 0, centerY = 0, r = 1, g = 1, b = 1, a = 1, shearX) {
  if (!gl) return {};
  if (scaleY === undefined) scaleY = scaleX;
  let texture = getOrLoadTextureFromUrl(url), clickableObject = {};
  if (texture) {
    let x0 = x - centerX * texture.width * scaleX;
    let y0 = y - centerY * texture.height * scaleY;
    let x1 = x + (1 - centerX) * texture.width * scaleX;
    let y1 = y + (1 - centerY) * texture.height * scaleY;

    matrix[0] = (x1 - x0) * pixelWidth;
    matrix[4] = 0.1;
    matrix[5] = (y1 - y0) * pixelHeight;
    matrix[12] = x0 * pixelWidth - 1;
    matrix[13] = y0 * pixelHeight - 1;

    gl.uniformMatrix4fv(matrixPos, false, matrix);
    gl.uniform4f(colorPos, r, g, b, a);
    gl.bindTexture(gl.TEXTURE_2D, texture.texture);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    matrix[4] = 0.0;

/*
    fillTexturedRectangle(
      x0,
      y0,
      x1,
      y1,
      r, g, b, a, texture.texture);
    */
  }
}

/** Kirjoittaa merkkijonon annettuun x-y-koordinaattiin.
 @param text Kirjoitettava merkkijono
 @param x Ensimmäisen merkin x-koordinaatti.
 @param y Ensimmäisen merkin y-koordinaatti.
 @param size Fontin koko. (voi jättää tyhjäksi)
 @param font Käytettävä fontti (esim. "sans-serif"). (voi jättää tyhjäksi)
 @param r Punainen värikomponentti väliltä 0.0 - 1.0.
 @param g Vihreä värikomponentti väliltä 0.0 - 1.0.
 @param b Sininen värikomponentti väliltä 0.0 - 1.0.
 @param a Värin Läpinäkyvyyskomponentti väliltä 0.0 - 1.0. */
function drawText(text, x, y, size=32, font='sans-serif', r=1, g=1, b=1, a=1) {
  if (!gl) return {};

  for(let i = 0; i < text.length; ++i) {
    if (i != 0) x += measureTextXAdvance(text[i-1], text[i], size, font);
    let texture = cacheFontGlyph(text[i], font, size);
    if (texture) {
      fillTexturedRectangle(x, y, x + texture.width, y + texture.height, r, g, b, a, texture.texture);
    }
  }
}

let t0 = 0;

let audioClips = {};
let audioCounter = 1;
let queuedClips = [];

/** Soittaa äänitiedoston annetusta osoitteesta.
  @param url Nettiosoite äänitiedostoon (.wav, .ogg, .mp3, .mp4)
  @param loop Jos true, niin äänitiedoston toisto aloitetaan alusta sen päättyessä. Jos false, niin
              äänitiedosto soitetaan vain kerran.
  @return Palauttaa ID-numeron äänitiedostolle. Kutsu stopAudio(id) pysäyttääksesi äänitiedoston soiton. */
function playAudio(url, volume=1.0, loop=false) {
  let counter = audioCounter++;
  let audio = audioClips[counter] = new Audio();
  audio.loop = !!loop;
  audio.currentTime = 0;
  audio.src = url;
  audio.volume = volume;
  audio.play().catch(() => {
    if (queuedClips.length < 3) {
      queuedClips.push(audio);
    }
  });
  return counter;
}

/* Pysäyttää annetun äänitiedoston soittamisen.
 @param id ID-parametri äänitiedostolle, joka on saatu paluuarvona playAudio()-funktiokutsusta. */
function stopAudio(id) {
  if (audioClips[id]) {
    audioClips[id].stop();
    delete audioClips[id];
  }
}

/** Määrittää funktion, jota kutsutaan toistuvasti animaation luomiseksi.
 @param frameCallback Kutsuttavan animaatiofunktion nimi. Annettua funktiota kutsutaan kahdella parametrilla,
  t ja dt, missä t on aika ohjelman alusta, ja dt kertoo kuinka monta millisekuntia on kulunut edellisestä
  animaatiofunktion kutsuhetkestä. */
function animate(frameCallback) {
  function cb(t) {
    clickStack = [];
    gl.viewport(0, 0, canvas.width, canvas.height);
    frameCallback(t, t - t0);
    t0 = t;
    // Retire just pressed keys.
    for(let key in keyState) {
      if (keyState[key] >= 1) ++keyState[key];
      if (keyState[key] < 0) delete keyState[key];
    }
    requestAnimationFrame(cb);
  }
  requestAnimationFrame(cb);
}

let keyState = {};


/** Palauttaa annetun näppäimen painalluksen tilan.
  @param key Näppäimen nimi, jota tarkastella. Ks. https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code/code_values
  @return Lukuarvo joka kertoo tämänhetkisen näppäimen painalluksen tilan. 0=ei painettu, 1=juuri painettu alas, suurempi kuin 1=pidetty pohjassa pidempään. -1: juuri päästetty ylös. */
function getKeyState(key) {
  return keyState[key]|0;
}

function playQueuedAudioClips() {
  for(let i = 0; i < queuedClips.length; ++i) {
    queuedClips[i].play().then(() => {
      queuedClips = [];
    });
  }
}

document.addEventListener('mousedown', playQueuedAudioClips);
document.addEventListener('keydown', playQueuedAudioClips);
document.addEventListener('touchstart', playQueuedAudioClips);

document.addEventListener('keydown', e => {
  if (!keyState[e.code]) keyState[e.code] = 1;
});

document.addEventListener('keyup', e => {
  if (keyState[e.code]) keyState[e.code] = -1;
  else delete keyState[e.code];
});
