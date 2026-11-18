import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js';

const canvas=document.querySelector('#game');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x83add1);scene.fog=new THREE.Fog(0x83add1,55,130);
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.05,300);

scene.add(new THREE.HemisphereLight(0xd7efff,0x52613e,2.2));
const sun=new THREE.DirectionalLight(0xffefd2,3);sun.position.set(-30,50,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-40;sun.shadow.camera.right=40;sun.shadow.camera.top=40;sun.shadow.camera.bottom=-40;scene.add(sun);

const world=new THREE.Group();scene.add(world);
const mat=(c,rough=.8)=>new THREE.MeshStandardMaterial({color:c,roughness:rough});
const box=(x,y,z,w,h,d,m,px=0,py=0,pz=0)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(px,py,pz);o.castShadow=o.receiveShadow=true;if(x||y||z) o.position.add(new THREE.Vector3(x,y,z));world.add(o);return o};

// Ground and castle arena
box(0,-.5,0,110,.8,110,mat(0x668852));
box(-34,2,0,2,4,68,mat(0xaaa696));box(34,2,0,2,4,68,mat(0xaaa696));
box(0,2,-34,68,4,2,mat(0xaaa696));box(0,2,34,68,4,2,mat(0xaaa696));
for(let i=-30;i<=30;i+=10){box(-33,5,i,6,2,7,mat(0xbab6a4));box(33,5,i,6,2,7,mat(0xbab6a4));}
// Towers, walls and obstacles
for(const x of [-27,27])for(const z of [-27,27]){box(x,7,z,9,14,9,mat(0xaaa696));box(x,15,z,11,2,11,mat(0x777a70));for(let k=0;k<4;k++){box(x+(k%2?3:-3),17,z+(k<2?3:-3),2,3,2,mat(0xaaa696));}}
for(const z of [-18,-8,8,18]){box(-10,1.5,z,3,3,8,mat(0x8b7c66));box(10,1.5,z,3,3,8,mat(0x8b7c66));}
box(0,.8,0,12,1.6,3,mat(0x8b7c66));box(0,4,0,3,6,3,mat(0x6e603f));

// Banners, flag bases and trees
function banner(team,x,z){const g=new THREE.Group();const pole=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,7,8),mat(0x4c3928));pole.position.y=3.5;g.add(pole);const cloth=new THREE.Mesh(new THREE.PlaneGeometry(3.2,2.2),mat(team==='blue'?0x287ec8:0xc94a43));cloth.position.set(1.5,5,0);cloth.rotation.y=Math.PI/2;g.add(cloth);g.position.set(x,0,z);world.add(g);return g}
const blueBanner=banner('blue',-31,-27),redBanner=banner('red',31,27);
for(const [x,z] of [[-45,-35],[45,-35],[-45,35],[45,35],[-48,0],[48,0]]){const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.7,.9,5,8),mat(0x5b4934));trunk.position.set(x,2.5,z);trunk.castShadow=true;world.add(trunk);const leaves=new THREE.Mesh(new THREE.ConeGeometry(4,8,9),mat(0x3f6337));leaves.position.set(x,8,z);leaves.castShadow=true;world.add(leaves)}

const player={pos:new THREE.Vector3(-28,0,-28),yaw:Math.PI/4,health:100,dead:false,holding:false,charge:0};
const keys={};let pointerLocked=false,arrows=[],cooldown=0,gameTime=180,blueScore=0,redScore=0;

function makeHuman(team,spawn){const g=new THREE.Group();const skin=mat(team==='blue'?0xd8b18a:0xb98a73);const armor=mat(team==='blue'?0x3b76a7:0x9d4140);const legs=mat(team==='blue'?0x27384a:0x50302f);
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.7,.65),armor);body.position.y=2.15;body.castShadow=true;g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.48,12,8),skin);head.position.y=3.38;head.castShadow=true;g.add(head);
  const helm=new THREE.Mesh(new THREE.CylinderGeometry(.5,.58,.28,10),mat(team==='blue'?0x6ba1bf:0xa95a50));helm.position.y=3.72;g.add(helm);
  for(const side of [-1,1]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.38,1.2,.42),legs);leg.position.set(side*.32,.75,0);leg.castShadow=true;g.add(leg)}
  g.position.copy(spawn);g.userData.team=team;g.userData.health=100;g.userData.speed=team==='red'?3.8:0;world.add(g);return g}
const enemies=[makeHuman('red',new THREE.Vector3(28,0,28)),makeHuman('red',new THREE.Vector3(24,0,18))];

function makeBow(){const g=new THREE.Group();const wood=mat(0x9b6535,.5);const curve=new THREE.Mesh(new THREE.TorusGeometry(.58,.055,8,24,Math.PI),wood);curve.rotation.z=Math.PI/2;curve.rotation.y=Math.PI/2;g.add(curve);return g}
const bow=makeBow();camera.add(bow);bow.position.set(.55,-.45,-1);bow.scale.set(.7,.7,.7);scene.add(camera);

canvas.addEventListener('click',()=>document.querySelector('#start').classList.contains('hidden')&&canvas.requestPointerLock());
document.querySelector('#play').onclick=()=>{document.querySelector('#start').classList.add('hidden');canvas.requestPointerLock()};
document.addEventListener('pointerlockchange',()=>pointerLocked=document.pointerLockElement===canvas);
const look={x:0,y:0};document.addEventListener('mousemove',e=>{if(pointerLocked){look.x-=e.movementX*.0022;look.y-=e.movementY*.0022;look.y=Math.max(-1.25,Math.min(.55,look.y))}});
document.addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);document.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
canvas.addEventListener('mousedown',e=>{if(e.button===0&&!player.dead&&pointerLocked)player.holding=true});document.addEventListener('mouseup',e=>{if(e.button===0&&player.holding)shoot()});

function shoot(){if(cooldown>0||player.dead){player.holding=false;return}player.holding=false;cooldown=.45;const power=.6+player.charge*.9;const origin=camera.position.clone();const dir=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);const arrow=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,1.2,7),mat(0x5c3d24));arrow.geometry.rotateX(Math.PI/2);arrow.position.copy(origin).add(dir.clone().multiplyScalar(.8));arrow.userData.velocity=dir.multiplyScalar(38*power);arrow.userData.life=4;arrow.castShadow=true;scene.add(arrow);arrows.push(arrow);player.charge=0}

function rayHitArrow(ar,human){const d=ar.position.distanceTo(human.position.clone().add(new THREE.Vector3(0,2,0)));return d<1.15}
function damage(human,amount){human.userData.health-=amount;if(human.userData.health<=0){human.visible=false;setTimeout(()=>{human.visible=true;human.userData.health=100;human.position.set(24+(Math.random()-1)*8,0,24+(Math.random()-1)*8)},2500)}}

const clock=new THREE.Clock();function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);cooldown-=dt;if(!player.dead&&pointerLocked){const forward=(keys.w?1:0)-(keys.s?1:0),side=(keys.d?1:0)-(keys.a?1:0);const speed=(keys.shift?9:6)*dt;const f=new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw));const r=new THREE.Vector3(Math.cos(player.yaw),0,-Math.sin(player.yaw));player.pos.add(f.multiplyScalar(forward*speed)).add(r.multiplyScalar(side*speed));player.pos.x=Math.max(-31,Math.min(31,player.pos.x));player.pos.z=Math.max(-31,Math.min(31,player.pos.z));}
  player.yaw=look.x;camera.position.set(player.pos.x,2.4+Math.sin(performance.now()*.008)*.025,player.pos.z);camera.rotation.set(look.y,player.yaw,0,'YXZ');
  if(player.holding)player.charge=Math.min(1,player.charge+dt*.8);document.querySelector('#chargeFill').style.width=(player.charge*100)+'%';
  for(let i=arrows.length-1;i>=0;i--){const a=arrows[i];a.userData.life-=dt;a.userData.velocity.y-=12*dt;a.position.addScaledVector(a.userData.velocity,dt);a.lookAt(a.position.clone().add(a.userData.velocity));for(const e of enemies)if(e.visible&&rayHitArrow(a,e)){damage(e,70);scene.remove(a);arrows.splice(i,1);break}if(a.userData.life<=0||a.position.y<.2){if(a.position.y<.2)a.position.y=.2;scene.remove(a);arrows.splice(i,1)}}
  // Enemy behavior
  for(const e of enemies){e.lookAt(player.pos.x,2,player.pos.z);const dist=e.position.distanceTo(player.pos);if(dist>12){const dir=player.pos.clone().sub(e.position).setY(0).normalize();e.position.addScaledVector(dir,dt*1.8);e.position.x=Math.max(-31,Math.min(31,e.position.x));e.position.z=Math.max(-31,Math.min(31,e.position.z));}}
  // CTF scoring and timer
  gameTime-=dt;const m=Math.floor(gameTime/60),s=Math.floor(gameTime%60);document.querySelector('#timer').textContent=`${m}:${s.toString().padStart(2,'0')}`;
  if(player.pos.distanceTo(new THREE.Vector3(31,0,27))<3){redScore++;document.querySelector('#redScore').textContent=redScore;player.pos.set(-28,0,-28);document.querySelector('#message').textContent='Enemy team scored!'}
  if(player.pos.distanceTo(new THREE.Vector3(-31,0,-27))<3&&blueScore>=0){document.querySelector('#message').textContent='Blue base defended'}
  renderer.render(scene,camera)}animate();

window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r'&&!player.dead){player.pos.set(-28,0,-28);player.health=100;document.querySelector('#healthFill').style.width='100%'}});
setInterval(()=>{for(const e of enemies){if(e.visible&&e.position.distanceTo(player.pos)<25){const dir=player.pos.clone().sub(e.position).normalize();const arrow=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,1.1,7),mat(0x5c3d24));arrow.geometry.rotateX(Math.PI/2);arrow.position.copy(e.position).add(new THREE.Vector3(0,2,0));arrow.userData.velocity=dir.multiplyScalar(26);arrow.userData.life=3;scene.add(arrow);arrows.push(arrow)}}},2200);
setInterval(()=>{const e=document.querySelector('#message');if(e.textContent)e.style.opacity='1'},100);
setTimeout(()=>document.querySelector('#message').textContent='',5000);
