import {expect,it} from 'vitest';
import {existsSync} from 'node:fs';
import {acquireDatabaseOwnership} from '../../src/db/ownership.js';
import {temporaryDatabase} from '../helpers/database.js';
it('同一规范路径只允许单实例持有，正常释放后可再次占用',()=>{
 const {db,path}=temporaryDatabase();db.close();const release=acquireDatabaseOwnership(path);
 try{expect(()=>acquireDatabaseOwnership(path)).toThrow('DATABASE_ALREADY_OWNED');expect(existsSync(path+'.owner')).toBe(true);}finally{release();}
 const next=acquireDatabaseOwnership(path);next();expect(existsSync(path+'.owner')).toBe(false);
});
