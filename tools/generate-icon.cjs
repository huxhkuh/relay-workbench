// Original Relay arrow icon, generated deterministically without fonts or image assets.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc]);}
function distance(x,y,a,b,c,d){const t=Math.max(0,Math.min(1,((x-a)*(c-a)+(y-b)*(d-b))/((c-a)**2+(d-b)**2)));return Math.hypot(x-a-t*(c-a),y-b-t*(d-b));}
module.exports=function generateIcon(directory){
 const size=256,data=Buffer.alloc((size*4+1)*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*(size*4+1)+1+x*4,inside=Math.hypot(Math.max(44-x,0,x-211),Math.max(44-y,0,y-211))<=44;
  const arrow=Math.min(distance(x,y,70,186,184,72),distance(x,y,104,72,184,72),distance(x,y,184,72,184,152))<11;
  data[i]=arrow?245:35;data[i+1]=arrow?251:111;data[i+2]=arrow?252:118;data[i+3]=inside?255:0;
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(data)),chunk('IEND',Buffer.alloc(0))]);
 fs.writeFileSync(path.join(directory,'relay.png'),png);
 const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
 fs.writeFileSync(path.join(directory,'relay.ico'),Buffer.concat([ico,png]));
};
