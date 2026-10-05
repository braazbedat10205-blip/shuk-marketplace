import {ConflictException,UnauthorizedException} from '@nestjs/common';
import {Role} from '@prisma/client';
import {compare} from 'bcryptjs';
import {validate} from 'class-validator';
import {AuthService,RegisterDto,strongPassword} from './auth';

const VALID_PASSWORD='Independent1!Pass';

function registration(password:unknown){
 const dto=new RegisterDto();
 Object.assign(dto,{email:'person@example.test',password,firstName:'Test',lastName:'User'});
 return validate(dto);
}

describe('registration password contract',()=>{
 it('accepts a valid password unrelated to the email',async()=>expect(await registration(VALID_PASSWORD)).toHaveLength(0));
 it.each([
  ['short','Aa1!short'],
  ['missing lowercase','ABCDEFGHIJK1!'],
  ['missing uppercase','abcdefghijk1!'],
  ['missing number','Abcdefghijkl!'],
  ['missing symbol','Abcdefghijkl1'],
  ['empty',''],
  ['missing',undefined],
 ])('rejects %s password payload',async(_label,password)=>expect(await registration(password)).not.toHaveLength(0));
 it('keeps the exported server policy aligned with accepted and rejected values',()=>{expect(strongPassword.test(VALID_PASSWORD)).toBe(true);expect(strongPassword.test('person@example.test')).toBe(false)});
});

describe('registration persistence and login',()=>{
 const users=new Map<string,any>();
 const db:any={
  user:{
   findUnique:jest.fn(async({where}:{where:{email:string}})=>users.get(where.email)??null),
   create:jest.fn(async({data}:{data:any})=>{const user={id:'user-1',email:data.email,passwordHash:data.passwordHash,firstName:data.firstName,lastName:data.lastName,suspendedAt:null,roles:[{role:data.roles.create.role}]};users.set(user.email,user);return user}),
  },
  authSession:{create:jest.fn(async()=>({id:'session-1'}))},
 };
 const jwt:any={signAsync:jest.fn(async()=> 'safe-access-token')};
 const mail:any={};
 const service=new AuthService(db,jwt,mail);

 beforeEach(()=>{users.clear();jest.clearAllMocks()});

 it('creates the account with the CUSTOMER role and a bcrypt hash, never plaintext',async()=>{
  const session=await service.register({email:' Person@Example.Test ',password:VALID_PASSWORD,firstName:' Test ',lastName:' User '} as RegisterDto);
  const stored=users.get('person@example.test');
  expect(stored.roles).toEqual([{role:Role.CUSTOMER}]);
  expect(stored.passwordHash).not.toBe(VALID_PASSWORD);
  expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  expect(await compare(VALID_PASSWORD,stored.passwordHash)).toBe(true);
  expect(session.user.roles).toContain(Role.CUSTOMER);
 });

 it('rejects a duplicate email',async()=>{await service.register({email:'person@example.test',password:VALID_PASSWORD,firstName:'Test',lastName:'User'} as RegisterDto);await expect(service.register({email:'PERSON@example.test',password:VALID_PASSWORD,firstName:'Test',lastName:'User'} as RegisterDto)).rejects.toBeInstanceOf(ConflictException)});

 it('allows login with the correct password',async()=>{await service.register({email:'person@example.test',password:VALID_PASSWORD,firstName:'Test',lastName:'User'} as RegisterDto);await expect(service.login({email:'person@example.test',password:VALID_PASSWORD})).resolves.toMatchObject({accessToken:'safe-access-token'})});

 it('rejects an incorrect password without exposing it',async()=>{const consoleSpy=jest.spyOn(console,'error').mockImplementation(()=>undefined);await service.register({email:'person@example.test',password:VALID_PASSWORD,firstName:'Test',lastName:'User'} as RegisterDto);let caught:unknown;try{await service.login({email:'person@example.test',password:'Wrong1!Password'})}catch(error){caught=error}expect(caught).toBeInstanceOf(UnauthorizedException);expect(String((caught as Error).message)).not.toContain('Wrong1!Password');expect(consoleSpy).not.toHaveBeenCalled();consoleSpy.mockRestore()});
});
