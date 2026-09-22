// Render only during a requested transition. Two reusable textures bound memory.
export function createDissolve(canvas,onLost){
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false}); if(!gl)throw Error('WebGL unavailable');
  const vert=`attribute vec2 p; varying vec2 uv; void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
  const frag=`precision mediump float; varying vec2 uv; uniform sampler2D a,b; uniform float t,aspect,aa,ba;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float field(vec2 p){return .57*noise(p)+.28*noise(p*2.1)+.15*noise(p*4.3);}
    vec4 photo(sampler2D img,vec2 v,float r){vec2 scale=aspect>r?vec2(aspect/r,1.):vec2(1.,r/aspect);vec2 q=(v-.5)*scale+.5; if(q.x<0.||q.x>1.||q.y<0.||q.y>1.)return vec4(vec3(.0392),1.);return texture2D(img,q);}
    void main(){vec4 target=photo(b,uv,ba);float n=field(uv*5.2+vec2(0,t*.15));float light=dot(target.rgb,vec3(.2126,.7152,.0722));float threshold=clamp(n*.8+(1.-light)*.2,0.,1.);float sweep=t*1.3-.15;float m=1.-smoothstep(sweep-.13,sweep+.13,threshold);float drift=.008*sin(t*3.14159);gl_FragColor=mix(photo(a,uv+vec2(0,drift),aa),photo(b,uv-vec2(0,drift),ba),m);}`;
  function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  const program=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,vert),fs=compile(gl.FRAGMENT_SHADER,frag);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Shader link failed');gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const uniforms=Object.fromEntries(['a','b','t','aspect','aa','ba'].map(n=>[n,gl.getUniformLocation(program,n)]));
  const textures=[gl.createTexture(),gl.createTexture()];gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  const lost=e=>{e.preventDefault();onLost();};canvas.addEventListener('webglcontextlost',lost);
  return {dispose(){textures.forEach(t=>gl.deleteTexture(t));gl.deleteBuffer(buffer);gl.deleteProgram(program);canvas.removeEventListener('webglcontextlost',lost);canvas.width=1;canvas.height=1;},prepare(from,to){const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.5);const scale=Math.min(dpr,1600/rect.width,1200/rect.height);canvas.width=Math.max(1,Math.round(rect.width*scale));canvas.height=Math.max(1,Math.round(rect.height*scale));gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);
    [from,to].forEach((img,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.uniform1i(uniforms[i?'b':'a'],i);gl.uniform1f(uniforms[i?'ba':'aa'],img.naturalWidth/img.naturalHeight);});gl.uniform1f(uniforms.aspect,canvas.width/canvas.height);},draw(t){gl.uniform1f(uniforms.t,t);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}};
}
