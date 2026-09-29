export function detectImage(buffer:Buffer):{extension:string;mime:string}|null{
 if(buffer.length>=3&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return{extension:'jpg',mime:'image/jpeg'};
 if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return{extension:'png',mime:'image/png'};
 if(buffer.length>=12&&buffer.subarray(0,4).toString('ascii')==='RIFF'&&buffer.subarray(8,12).toString('ascii')==='WEBP')return{extension:'webp',mime:'image/webp'};
 return null;
}
