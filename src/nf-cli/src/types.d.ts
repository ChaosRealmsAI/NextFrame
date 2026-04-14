/**
 * @typedef {Object} Timeline
 * @property {string} schema
 * @property {number} duration
 * @property {string} [background]
 * @property {{width:number,height:number,aspectRatio:number,fps:number}} project
 * @property {Chapter[]} [chapters]
 * @property {Marker[]} [markers]
 * @property {Track[]} tracks
 * @property {Asset[]} [assets]
 */
/** @typedef {Object} Track @property {string} id @property {string} kind @property {boolean} [muted] @property {Clip[]} clips */
/** @typedef {Object} Clip @property {string} id @property {TimeValue} start @property {number} dur @property {string} scene @property {Object} [params] @property {string} [blend] */
/** @typedef {number|TimeExpression} TimeValue */
/** @typedef {{at:string}|{after:string,gap?:number}|{before:string,gap?:number}|{sync:string}|{until:string}|{offset:string,by?:number}} TimeExpression */
/** @typedef {Object} Chapter @property {string} id @property {number} start @property {number} [end] */
/** @typedef {Object} Marker @property {string} id @property {number} t */
/** @typedef {Object} Asset @property {string} id @property {string} [path] @property {string} [kind] */
/**
 * @template T
 * @typedef {{ok:true,value:T}|{ok:false,error:{code:string,message:string,ref?:string,hint?:string},hints?:Array<{msg:string}>}} Result
 */
/** @typedef {Object} SceneMeta @property {string} id @property {string} category @property {string} description @property {number} duration_hint @property {ParamSpec[]} params @property {string} [ai_prompt_example] */
/** @typedef {Object} ParamSpec @property {string} name @property {string} type @property {*} default @property {number[]} [range] @property {string[]} [options] @property {string} [semantic] @property {boolean} [required] */
