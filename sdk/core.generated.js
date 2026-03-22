// ═══════════════════════════════════════════════════════════════
//  FELISSSCRIPT INTERPRETER  v0.3
//  NEW: enum (simple + data variants), interface (duck typing),
//       type alias, #include / #imp directives (parsed, no-op),
//       from X import Y (parsed, no-op)
// ═══════════════════════════════════════════════════════════════

const T={
  NUM:'NUM',STR:'STR',BOOL:'BOOL',IDENT:'IDENT',TMPL:'TMPL',
  LET:'LET',CONST:'CONST',FN:'FN',RETURN:'RETURN',
  IF:'IF',ELSE:'ELSE',FOR:'FOR',WHILE:'WHILE',LOOP:'LOOP',
  MATCH:'MATCH',TRY:'TRY',CATCH:'CATCH',THROW:'THROW',
  ASYNC:'ASYNC',AWAIT:'AWAIT',SCOPE:'SCOPE',
  CLASS:'CLASS',TRAIT:'TRAIT',IMPL:'IMPL',SELF:'SELF',NEW:'NEW',
  ENUM:'ENUM',INTERFACE:'INTERFACE',TYPE:'TYPE',
  FROM:'FROM',IMPORT:'IMPORT',
  IN:'IN',SHOW:'SHOW',BREAK:'BREAK',CONTINUE:'CONTINUE',
  OK:'OK',ERR:'ERR',
  PLUS:'PLUS',MINUS:'MINUS',STAR:'STAR',SLASH:'SLASH',PCT:'PCT',POW:'POW',
  EQ:'EQ',EQEQ:'EQEQ',NEQ:'NEQ',LT:'LT',GT:'GT',LTE:'LTE',GTE:'GTE',
  AND:'AND',OR:'OR',NOT:'NOT',
  PEQ:'PEQ',MEQ:'MEQ',SEQ:'SEQ',DEQ:'DEQ',
  ARROW:'ARROW',FATAR:'FATAR',PIPE:'PIPE',DOTDOT:'DOTDOT',
  COLON:'COLON',DCOLON:'DCOLON',
  LP:'LP',RP:'RP',LB:'LB',RB:'RB',LS:'LS',RS:'RS',
  COMMA:'COMMA',DOT:'DOT',HASH:'HASH',EOF:'EOF',
};
const KW={
  let:T.LET,const:T.CONST,fn:T.FN,return:T.RETURN,
  if:T.IF,else:T.ELSE,for:T.FOR,while:T.WHILE,loop:T.LOOP,
  match:T.MATCH,try:T.TRY,catch:T.CATCH,throw:T.THROW,
  async:T.ASYNC,await:T.AWAIT,scope:T.SCOPE,
  class:T.CLASS,trait:T.TRAIT,impl:T.IMPL,self:T.SELF,new:T.NEW,
  enum:T.ENUM,interface:T.INTERFACE,type:T.TYPE,
  from:T.FROM,import:T.IMPORT,
  in:T.IN,show:T.SHOW,break:T.BREAK,continue:T.CONTINUE,
  Ok:T.OK,Err:T.ERR,
  true:T.BOOL,false:T.BOOL,
};
const TYPES=new Set(['int','float','str','bool','list','dict','void','Self']);

// ── LEXER ─────────────────────────────────────────────────────
class Lexer{
  constructor(s){this.s=s;this.p=0;this.ln=1}
  c(o=0){return this.s[this.p+o]||''}
  mv(){const c=this.s[this.p++];if(c==='\n')this.ln++;return c}
  ws(){
    for(;;){
      const c=this.c();
      if(c===' '||c==='\t'||c==='\r'){this.p++;continue}
      if(c==='/'&&this.c(1)==='/'){while(this.p<this.s.length&&this.c()!=='\n')this.p++;continue}
      if(c==='/'&&this.c(1)==='*'){this.p+=2;while(this.p<this.s.length&&!(this.c()==='*'&&this.c(1)==='/'))this.mv();this.p+=2;continue}
      break
    }
  }
  num(){let s=this.p;while(/[0-9]/.test(this.c()))this.p++;if(this.c()==='.'&&this.c(1)!=='.'){this.p++;while(/[0-9]/.test(this.c()))this.p++}return{type:T.NUM,v:parseFloat(this.s.slice(s,this.p)),ln:this.ln}}
  str(q){this.p++;let v='';while(this.p<this.s.length&&this.c()!==q){if(this.c()==='\\'){this.p++;const e=this.mv();v+=(e==='n'?'\n':e==='t'?'\t':e)}else v+=this.mv()}this.p++;return{type:T.STR,v,ln:this.ln}}
  tmpl(){this.p++;let v='';while(this.p<this.s.length&&this.c()!=='`'){if(this.c()==='$'&&this.c(1)==='{'){this.p+=2;let e='',d=1;while(this.p<this.s.length&&d>0){const x=this.c();if(x==='{')d++;else if(x==='}'){d--;if(d===0)break}e+=this.mv()}this.p++;v+='\x01'+e+'\x02'}else v+=this.mv()}this.p++;return{type:T.TMPL,v,ln:this.ln}}
  id(){let s=this.p;while(/[a-zA-Z0-9_]/.test(this.c()))this.p++;const w=this.s.slice(s,this.p),kt=KW[w];if(kt){if(kt===T.BOOL)return{type:T.BOOL,v:w==='true',ln:this.ln};return{type:kt,v:w,ln:this.ln}}return{type:T.IDENT,v:w,ln:this.ln}}
  // Read #include / #imp / #define etc as directives
  directive(){
    this.p++; // consume #
    this.ws();
    let name='';while(/[a-z]/.test(this.c()))name+=this.mv();
    // read rest of line
    let rest='';while(this.p<this.s.length&&this.c()!=='\n')rest+=this.mv();
    return{type:'DIRECTIVE',name,rest:rest.trim(),ln:this.ln}
  }
  tokenize(){
    const ts=[];
    while(this.p<this.s.length){
      this.ws();if(this.p>=this.s.length)break;
      const c=this.c(),ln=this.ln;
      if(c==='\n'){this.p++;this.ln++;const last=ts[ts.length-1];if(last&&![T.LB,T.LS,T.LP,T.COMMA,T.ARROW,T.FATAR,'NL'].includes(last.type))ts.push({type:'NL',ln});continue}
      if(c==='#'){ts.push(this.directive());continue}
      if(/[0-9]/.test(c)){ts.push(this.num());continue}
      if(c==='"'||c==="'"){ts.push(this.str(c));continue}
      if(c==='`'){ts.push(this.tmpl());continue}
      if(/[a-zA-Z_]/.test(c)){ts.push(this.id());continue}
      this.p++;const n=this.c();
      if(c==='+'){ts.push(n==='='?(this.p++,{type:T.PEQ,v:'+=',ln}):{type:T.PLUS,v:'+',ln})}
      else if(c==='-'){if(n==='>'){this.p++;ts.push({type:T.ARROW,v:'->',ln})}else if(n==='='){this.p++;ts.push({type:T.MEQ,v:'-=',ln})}else ts.push({type:T.MINUS,v:'-',ln})}
      else if(c==='*'){if(n==='*'){this.p++;ts.push({type:T.POW,v:'**',ln})}else if(n==='='){this.p++;ts.push({type:T.SEQ,v:'*=',ln})}else ts.push({type:T.STAR,v:'*',ln})}
      else if(c==='/'){ts.push(n==='='?(this.p++,{type:T.DEQ,v:'/=',ln}):{type:T.SLASH,v:'/',ln})}
      else if(c==='%')ts.push({type:T.PCT,v:'%',ln})
      else if(c==='='){if(n==='='){this.p++;ts.push({type:T.EQEQ,v:'==',ln})}else if(n==='>'){this.p++;ts.push({type:T.FATAR,v:'=>',ln})}else ts.push({type:T.EQ,v:'=',ln})}
      else if(c==='!'){ts.push(n==='='?(this.p++,{type:T.NEQ,v:'!=',ln}):{type:T.NOT,v:'!',ln})}
      else if(c==='<'){ts.push(n==='='?(this.p++,{type:T.LTE,v:'<=',ln}):{type:T.LT,v:'<',ln})}
      else if(c==='>'){ts.push(n==='='?(this.p++,{type:T.GTE,v:'>=',ln}):{type:T.GT,v:'>',ln})}
      else if(c==='&'&&n==='&'){this.p++;ts.push({type:T.AND,v:'&&',ln})}
      else if(c==='|'){if(n==='|'){this.p++;ts.push({type:T.OR,v:'||',ln})}else ts.push({type:T.PIPE,v:'|',ln})}
      else if(c==='.'){if(n==='.'){this.p++;ts.push({type:T.DOTDOT,v:'..',ln})}else ts.push({type:T.DOT,v:'.',ln})}
      else if(c===':'){ts.push(n===':'?(this.p++,{type:T.DCOLON,v:'::',ln}):{type:T.COLON,v:':',ln})}
      else if(c==='(')ts.push({type:T.LP,v:'(',ln})
      else if(c===')')ts.push({type:T.RP,v:')',ln})
      else if(c==='{')ts.push({type:T.LB,v:'{',ln})
      else if(c==='}')ts.push({type:T.RB,v:'}',ln})
      else if(c==='[')ts.push({type:T.LS,v:'[',ln})
      else if(c===']')ts.push({type:T.RS,v:']',ln})
      else if(c===',')ts.push({type:T.COMMA,v:',',ln})
      else if(c===';')ts.push({type:'NL',ln})
    }
    ts.push({type:T.EOF,v:'',ln:this.ln});return ts
  }
}

// ── PARSER ────────────────────────────────────────────────────
class Parser{
  constructor(ts){this.ts=ts.filter(t=>t.type!=='NL');this.p=0}
  pk(o=0){return this.ts[this.p+o]||{type:T.EOF}}
  mv(){return this.ts[this.p++]||{type:T.EOF}}
  is(...ts){return ts.includes(this.pk().type)}
  eat(t,m){if(!this.is(t))throw new Error(`Line ${this.pk().ln||'?'}: Expected ${m||t}, got '${this.pk().v||this.pk().type}'`);return this.mv()}
  mat(...ts){return ts.includes(this.pk().type)?this.mv():null}
  eatTH(){if(this.is(T.COLON)&&this.pk(1)&&(TYPES.has(this.pk(1).v)||/^[A-Z]/.test(this.pk(1).v||''))){this.mv();this.mv()}}

  parse(){const b=[];while(!this.is(T.EOF))b.push(this.stmt());return{type:'Prog',body:b}}

  stmt(){
    const t=this.pk();
    if(t.type==='DIRECTIVE')return this.directive();
    if(t.type===T.FROM)return this.fromImport();
    if(t.type===T.LET||t.type===T.CONST)return this.varDecl();
    if(t.type===T.FN)return this.fnDecl();
    if(t.type===T.ASYNC)return this.asyncFn();
    if(t.type===T.CLASS)return this.classDecl();
    if(t.type===T.TRAIT)return this.traitDecl();
    if(t.type===T.IMPL)return this.implDecl();
    if(t.type===T.ENUM)return this.enumDecl();
    if(t.type===T.INTERFACE)return this.interfaceDecl();
    if(t.type===T.TYPE)return this.typeAlias();
    if(t.type===T.RETURN){this.mv();const v=this.is(T.RB)||this.is(T.EOF)?null:this.expr();return{type:'Return',v}}
    if(t.type===T.IF)return this.ifStmt();
    if(t.type===T.FOR)return this.forStmt();
    if(t.type===T.WHILE)return this.whileStmt();
    if(t.type===T.LOOP){this.mv();return{type:'Loop',body:this.block()}}
    if(t.type===T.MATCH)return this.matchStmt();
    if(t.type===T.TRY)return this.tryStmt();
    if(t.type===T.THROW){this.mv();return{type:'Throw',v:this.expr()}}
    if(t.type===T.SCOPE){this.mv();return{type:'Scope',body:this.block()}}
    if(t.type===T.SHOW){this.mv();return{type:'Show',v:this.expr()}}
    if(t.type===T.BREAK){this.mv();return{type:'Break'}}
    if(t.type===T.CONTINUE){this.mv();return{type:'Continue'}}
    if(t.type===T.LB)return this.block();
    return this.assignStmt();
  }

  directive(){
    const d=this.mv();// consume DIRECTIVE token
    return{type:'Directive',name:d.name,rest:d.rest}
  }
  fromImport(){
    this.mv();// from
    const mod=this.eat(T.IDENT,'module name').v;
    this.eat(T.IMPORT,'import');
    const names=[];
    while(this.is(T.IDENT)){names.push(this.mv().v);if(!this.mat(T.COMMA))break}
    return{type:'FromImport',mod,names}
  }
  typeAlias(){
    this.mv();// type
    const name=this.eat(T.IDENT,'type name').v;
    this.eat(T.EQ,'=');
    // check if it's a record alias: { fields }
    if(this.is(T.LB)){
      this.mv();
      const fields=[];
      while(!this.is(T.RB)&&!this.is(T.EOF)){
        const fn2=this.eat(T.IDENT,'field').v;this.eatTH();
        fields.push(fn2);if(!this.mat(T.COMMA))break
      }
      this.eat(T.RB,'}');return{type:'TypeAlias',name,alias:{type:'Record',fields}}
    }
    const target=this.eat(T.IDENT,'type').v;
    return{type:'TypeAlias',name,alias:{type:'Simple',target}}
  }
  enumDecl(){
    this.mv();const name=this.eat(T.IDENT,'enum name').v;
    this.eat(T.LB,'{');const variants=[];
    while(!this.is(T.RB)&&!this.is(T.EOF)){
      const vname=this.eat(T.IDENT,'variant').v;
      let fields=null;
      if(this.is(T.LP)){
        this.mv();fields=[];
        while(!this.is(T.RP)&&!this.is(T.EOF)){
          // accept type names or values
          fields.push(this.eat(T.IDENT,'type').v);if(!this.mat(T.COMMA))break
        }
        this.eat(T.RP,')')
      }
      variants.push({name:vname,fields});if(!this.mat(T.COMMA))break
    }
    this.eat(T.RB,'}');return{type:'EnumDecl',name,variants}
  }
  interfaceDecl(){
    this.mv();const name=this.eat(T.IDENT,'interface name').v;
    this.eat(T.LB,'{');const sigs=[];
    while(!this.is(T.RB)&&!this.is(T.EOF)){
      this.eat(T.FN,'fn');const n=this.eat(T.IDENT,'method').v;
      const ps=this.params();if(this.mat(T.ARROW)&&this.is(T.IDENT))this.mv();
      sigs.push({n,ps});
    }
    this.eat(T.RB,'}');return{type:'InterfaceDecl',name,sigs}
  }
  varDecl(){const k=this.mv().type===T.CONST?'const':'let';const name=this.eat(T.IDENT,'var').v;this.eatTH();this.eat(T.EQ,'=');return{type:'VarDecl',k,name,v:this.expr()}}
  fnDecl(isA=false){this.mv();const name=this.eat(T.IDENT,'fn name').v;const params=this.params();if(this.mat(T.ARROW)&&this.is(T.IDENT)&&(TYPES.has(this.pk().v)||/^[A-Z]/.test(this.pk().v)))this.mv();return{type:'FnDecl',name,params,body:this.block(),isA}}
  asyncFn(){this.mv();if(!this.is(T.FN))throw new Error('Expected fn after async');return this.fnDecl(true)}
  params(){this.eat(T.LP,'(');const ps=[];while(!this.is(T.RP)&&!this.is(T.EOF)){if(this.is(T.SELF)){this.mv();ps.push('self')}else{const n=this.eat(T.IDENT,'param').v;this.eatTH();ps.push(n)}if(!this.mat(T.COMMA))break}this.eat(T.RP,')');return ps}
  classDecl(){this.mv();const name=this.eat(T.IDENT,'class').v;let ext=null;if(this.pk().v==='extends'){this.mv();ext=this.eat(T.IDENT,'parent').v}this.eat(T.LB,'{');const fields=[],methods=[];while(!this.is(T.RB)&&!this.is(T.EOF)){if(this.is(T.FN)||this.is(T.ASYNC)){methods.push(this.fnDecl(this.is(T.ASYNC)))}else{const n=this.eat(T.IDENT,'field').v;this.eatTH();this.mat(T.EQ);const dflt=(!this.is(T.COMMA)&&!this.is(T.RB)&&!this.is(T.EOF))?this.expr():null;fields.push({n,dflt});this.mat(T.COMMA)}}this.eat(T.RB,'}');return{type:'ClassDecl',name,ext,fields,methods}}
  traitDecl(){this.mv();const name=this.eat(T.IDENT,'trait').v;this.eat(T.LB,'{');const sigs=[];while(!this.is(T.RB)&&!this.is(T.EOF)){this.eat(T.FN,'fn');const n=this.eat(T.IDENT,'method').v;const ps=this.params();if(this.mat(T.ARROW)&&this.is(T.IDENT))this.mv();sigs.push({n,ps})}this.eat(T.RB,'}');return{type:'TraitDecl',name,sigs}}
  implDecl(){this.mv();const tName=this.eat(T.IDENT,'trait/class').v;let forClass=null;if(this.pk().v==='for'){this.mv();forClass=this.eat(T.IDENT,'class').v}this.eat(T.LB,'{');const methods=[];while(!this.is(T.RB)&&!this.is(T.EOF)){if(this.is(T.ASYNC))methods.push(this.asyncFn());else{this.eat(T.FN,'fn');const name=this.eat(T.IDENT,'method').v;const params=this.params();if(this.mat(T.ARROW)&&this.is(T.IDENT))this.mv();methods.push({type:'FnDecl',name,params,body:this.block(),isA:false})}}this.eat(T.RB,'}');return{type:'ImplDecl',tName,forClass,methods}}
  ifStmt(){this.mv();const cond=this.expr(),then=this.block();let els=null;if(this.mat(T.ELSE)){els=this.is(T.IF)?this.ifStmt():this.block()}return{type:'If',cond,then,els}}
  forStmt(){this.mv();const vn=this.eat(T.IDENT,'var').v;this.eat(T.IN,'in');const iter=this.expr();return{type:'For',vn,iter,body:this.block()}}
  whileStmt(){this.mv();return{type:'While',cond:this.expr(),body:this.block()}}
  matchStmt(){
    this.mv();const e=this.expr();this.eat(T.LB,'{');const cases=[];
    while(!this.is(T.RB)&&!this.is(T.EOF)){
      const pats=[this.mPat()];while(this.mat(T.PIPE))pats.push(this.mPat());
      this.eat(T.FATAR,'=>');
      const body=this.is(T.LB)?this.block():{type:'Block',body:[this.stmt()]};
      cases.push({pats,body});
    }
    this.eat(T.RB,'}');return{type:'Match',e,cases}
  }
  mPat(){
    if(this.is(T.IDENT)&&this.pk().v==='_'){this.mv();return{type:'Wild'}}
    if(this.is(T.OK)){this.mv();this.eat(T.LP,'(');const b=this.eat(T.IDENT,'binding').v;this.eat(T.RP,')');return{type:'OkPat',b}}
    if(this.is(T.ERR)){this.mv();this.eat(T.LP,'(');const b=this.eat(T.IDENT,'binding').v;this.eat(T.RP,')');return{type:'ErrPat',b}}
    // EnumVariant pattern: Name::Variant(binding) or Name::Variant
    if(this.is(T.IDENT)&&this.pk(1).type===T.DCOLON){
      const ename=this.mv().v;this.mv();// ::
      const vname=this.eat(T.IDENT,'variant').v;
      let bindings=null;
      if(this.is(T.LP)){this.mv();bindings=[];while(!this.is(T.RP)&&!this.is(T.EOF)){bindings.push(this.eat(T.IDENT,'binding').v);if(!this.mat(T.COMMA))break}this.eat(T.RP,')')}
      return{type:'EnumPat',ename,vname,bindings}
    }
    return this.primary()
  }
  tryStmt(){this.mv();const body=this.block();this.eat(T.CATCH,'catch');const en=this.eat(T.IDENT,'error var').v;return{type:'Try',body,en,cb:this.block()}}
  block(){this.eat(T.LB,'{');const b=[];while(!this.is(T.RB)&&!this.is(T.EOF))b.push(this.stmt());this.eat(T.RB,'}');return{type:'Block',body:b}}
  assignStmt(){
    const e=this.expr();
    const aops=[T.EQ,T.PEQ,T.MEQ,T.SEQ,T.DEQ];
    const op=this.pk();
    if(aops.includes(op.type)){
      this.mv();const v=this.expr();
      if(e.type==='Ident')return{type:'Assign',name:e.n,op:op.v,v};
      if(e.type==='Memb')return{type:'MembAssign',obj:e.obj,prop:e.prop,op:op.v,v};
      if(e.type==='Idx')return{type:'IdxAssign',obj:e.obj,idx:e.idx,op:op.v,v};
    }
    return{type:'ExprStmt',e}
  }
  expr(){return this.range()}
  range(){let l=this.or();if(this.mat(T.DOTDOT)){return{type:'Range',l,r:this.or()}}return l}
  or(){let l=this.and();while(this.mat(T.OR)){l={type:'Bin',op:'||',l,r:this.and()}}return l}
  and(){let l=this.eq();while(this.mat(T.AND)){l={type:'Bin',op:'&&',l,r:this.eq()}}return l}
  eq(){let l=this.cmp();let op;while((op=this.mat(T.EQEQ,T.NEQ))){l={type:'Bin',op:op.v,l,r:this.cmp()}}return l}
  cmp(){let l=this.add();let op;while((op=this.mat(T.LT,T.GT,T.LTE,T.GTE))){l={type:'Bin',op:op.v,l,r:this.add()}}return l}
  add(){let l=this.mul();let op;while((op=this.mat(T.PLUS,T.MINUS))){l={type:'Bin',op:op.v,l,r:this.mul()}}return l}
  mul(){let l=this.pow();let op;while((op=this.mat(T.STAR,T.SLASH,T.PCT))){l={type:'Bin',op:op.v,l,r:this.pow()}}return l}
  pow(){let l=this.unary();if(this.mat(T.POW)){return{type:'Bin',op:'**',l,r:this.pow()}}return l}
  unary(){if(this.mat(T.MINUS))return{type:'Un',op:'-',e:this.unary()};if(this.mat(T.NOT))return{type:'Un',op:'!',e:this.unary()};if(this.mat(T.AWAIT))return{type:'Await',e:this.unary()};return this.postfix()}
  postfix(){
    let e=this.primary();
    for(;;){
      if(this.mat(T.DOT)){const prop=this.eat(T.IDENT,'prop').v;if(this.is(T.LP)){const args=this.args();e={type:'Meth',obj:e,m:prop,args}}else e={type:'Memb',obj:e,prop}}
      else if(this.is(T.LS)){this.mv();const idx=this.expr();this.eat(T.RS,']');e={type:'Idx',obj:e,idx}}
      else if(this.is(T.LP)){const args=this.args();e=e.type==='Ident'?{type:'Call',fn:e.n,args}:{type:'CallE',fn:e,args}}
      else if(this.mat(T.DCOLON)){const m=this.eat(T.IDENT,'member').v;if(this.is(T.LP)){const args=this.args();e={type:'SCall',cls:e,m,args}}else e={type:'SCMem',cls:e,m}}
      else break
    }
    return e
  }
  args(){this.eat(T.LP,'(');const a=[];while(!this.is(T.RP)&&!this.is(T.EOF)){a.push(this.expr());if(!this.mat(T.COMMA))break}this.eat(T.RP,')');return a}
  primary(){
    if(this.is(T.OK)){this.mv();this.eat(T.LP,'(');const v=this.expr();this.eat(T.RP,')');return{type:'OkE',v}}
    if(this.is(T.ERR)){this.mv();this.eat(T.LP,'(');const v=this.expr();this.eat(T.RP,')');return{type:'ErrE',v}}
    if(this.is(T.NEW)){this.mv();const cls=this.eat(T.IDENT,'class').v;const args=this.args();return{type:'New',cls,args}}
    if(this.is(T.SELF)){this.mv();return{type:'Ident',n:'self'}}
    const t=this.mv();
    if(t.type===T.NUM)return{type:'Num',v:t.v}
    if(t.type===T.STR)return{type:'Str',v:t.v}
    if(t.type===T.TMPL)return{type:'Tmpl',v:t.v}
    if(t.type===T.BOOL)return{type:'Bool',v:t.v}
    if(t.type===T.IDENT){if(this.is(T.FATAR)){this.mv();const b=this.is(T.LB)?this.block():this.expr();return{type:'Lambda',ps:[t.v],b}}return{type:'Ident',n:t.v}}
    if(t.type===T.LP){const sp=this.p;const lps=[];let ok=true;while(!this.is(T.RP)&&!this.is(T.EOF)){if(!this.is(T.IDENT)){ok=false;break}lps.push(this.mv().v);this.eatTH();if(!this.mat(T.COMMA))break}if(ok&&this.is(T.RP)){this.mv();if(this.is(T.FATAR)){this.mv();const b=this.is(T.LB)?this.block():this.expr();return{type:'Lambda',ps:lps,b}}}this.p=sp;const e=this.expr();this.eat(T.RP,')');return e}
    if(t.type===T.LS){const items=[];while(!this.is(T.RS)&&!this.is(T.EOF)){items.push(this.expr());if(!this.mat(T.COMMA))break}this.eat(T.RS,']');return{type:'List',items}}
    if(t.type===T.LB){const es=[];while(!this.is(T.RB)&&!this.is(T.EOF)){let k;if(this.is(T.IDENT)||this.is(T.STR))k=this.mv().v;else throw new Error(`Expected dict key at line ${this.pk().ln}`);this.eat(T.COLON,':');es.push({k,v:this.expr()});if(!this.mat(T.COMMA))break}this.eat(T.RB,'}');return{type:'Dict',es}}
    throw new Error(`Line ${t.ln}: Unexpected '${t.v||t.type}'`)
  }
}

// ── RUNTIME ───────────────────────────────────────────────────
class FLSFn{constructor(name,ps,body,cls,isA){this.name=name;this.ps=ps;this.body=body;this.cls=cls;this.isA=isA}}
class FLSClass{constructor(name,fields,methods){this.name=name;this.fields=fields;this.methods=methods}}
class FLSInstance{constructor(cls,fields){this.cls=cls;this.fields=fields}}
class FLSEnum{constructor(name,variants){this.name=name;this.variants=variants}}
class FLSVariant{constructor(enumName,name,data){this.enumName=enumName;this.name=name;this.data=data}}
class OkVal{constructor(v){this.v=v}}
class ErrVal{constructor(v){this.v=v}}
class Ret{constructor(v){this.v=v}}
class Brk{}
class Cnt{}

class Env{
  constructor(p=null){this.m=new Map();this.c=new Set();this.p=p}
  def(n,v,isC=false){this.m.set(n,v);if(isC)this.c.add(n)}
  get(n){if(this.m.has(n))return this.m.get(n);if(this.p)return this.p.get(n);throw new Error(`Undefined: '${n}'`)}
  set(n,v){if(this.m.has(n)){if(this.c.has(n))throw new Error(`Cannot reassign const '${n}'`);this.m.set(n,v);return}if(this.p){this.p.set(n,v);return}throw new Error(`Undefined: '${n}'`)}
}

class Interp{
  constructor(cb){this.cb=cb;this.G=new Env();this._impl=new Map();this._setup()}
  _setup(){
    const g=this.G,bi=(n,f)=>g.def(n,{__b__:true,call:f});
    bi('sqrt',a=>Math.sqrt(a[0]));bi('abs',a=>Math.abs(a[0]));bi('floor',a=>Math.floor(a[0]));
    bi('ceil',a=>Math.ceil(a[0]));bi('round',a=>Math.round(a[0]));bi('max',a=>Math.max(...a));bi('min',a=>Math.min(...a));
    bi('random',()=>Math.random());bi('int',a=>parseInt(a[0]));bi('float',a=>parseFloat(a[0]));
    bi('str',a=>this.fmt(a[0]));bi('bool',a=>!!a[0]);
    bi('len',a=>{const v=a[0];if(Array.isArray(v))return v.length;if(typeof v==='string')return v.length;if(v&&typeof v==='object')return Object.keys(v).length;throw new Error('len() needs list/str/dict')});
    bi('type',a=>{const v=a[0];if(v instanceof OkVal)return'Ok';if(v instanceof ErrVal)return'Err';if(v instanceof FLSVariant)return`${v.enumName}::${v.name}`;if(v instanceof FLSInstance)return v.cls.name;if(Array.isArray(v))return'list';return typeof v});
    bi('range',a=>a.length===1?Array.from({length:a[0]},(_,i)=>i):Array.from({length:a[1]-a[0]},(_,i)=>i+a[0]));
    bi('keys',a=>Object.keys(a[0]));bi('values',a=>Object.values(a[0]));
    bi('print',a=>{this.cb(a.map(v=>this.fmt(v)).join(' '));return null});
    bi('assert',a=>{if(!a[0])throw new Error(a[1]||'Assertion failed');return null});
    bi('is_ok',a=>a[0] instanceof OkVal);bi('is_err',a=>a[0] instanceof ErrVal);
    bi('unwrap',a=>{if(a[0] instanceof OkVal)return a[0].v;throw new Error(`Unwrap on Err: ${this.fmt(a[0].v)}`)});
    bi('unwrap_or',a=>a[0] instanceof OkVal?a[0].v:a[1]);
  }
  fmt(v){
    if(v instanceof OkVal)return`Ok(${this.fmt(v.v)})`;
    if(v instanceof ErrVal)return`Err(${this.fmt(v.v)})`;
    if(v instanceof FLSVariant){const d=v.data.length?`(${v.data.map(x=>this.fmt(x)).join(', ')})`:''  ;return`${v.enumName}::${v.name}${d}`}
    if(v instanceof FLSInstance){const fs=Object.entries(v.fields).map(([k,x])=>`${k}: ${this.fmt(x)}`).join(', ');return`${v.cls.name} { ${fs} }`}
    if(v===null||v===undefined)return'(default)';
    if(v===true)return'true';if(v===false)return'false';
    if(Array.isArray(v))return'['+v.map(x=>this.fmt(x)).join(', ')+']';
    if(v instanceof FLSFn)return`<fn ${v.name}>`;if(v&&v.__b__)return'<builtin>';
    if(typeof v==='object'){return'{ '+Object.entries(v).map(([k,x])=>`${k}: ${this.fmt(x)}`).join(', ')+' }'}
    return String(v)
  }
  truthy(v){return v!==null&&v!==undefined&&v!==false&&v!==0&&v!==''}

  ev(n,e){
    if(!n)return null;
    switch(n.type){
      case 'Prog':case 'Block':{const be=n.type==='Block'?new Env(e):e;let last=null;for(const s of n.body){const r=this.ev(s,be);if(r instanceof Ret||r instanceof Brk||r instanceof Cnt)return r;last=r}return last}
      case 'Directive':case 'FromImport':return null; // parsed, no-op in interpreter
      case 'TypeAlias':{e.def(n.name,{__typeAlias__:true,alias:n.alias});return null}
      case 'EnumDecl':{
        const en=new FLSEnum(n.name,n.variants);
        e.def(n.name,en);
        // register namespace on env so Enum::Variant works
        return en
      }
      case 'InterfaceDecl':{e.def(n.name,{__interface__:true,name:n.name,sigs:n.sigs});return null}
      case 'VarDecl':{const v=this.ev(n.v,e);e.def(n.name,v,n.k==='const');return v}
      case 'FnDecl':{const f=new FLSFn(n.name,n.params,n.body,e,n.isA);e.def(n.name,f);return f}
      case 'ClassDecl':{
        const cls=new FLSClass(n.name,n.fields,n.methods);
        e.def(n.name,cls);
        if(!this._impl.has(n.name))this._impl.set(n.name,new Map());
        for(const m of n.methods){const mf=new FLSFn(m.name,m.params,m.body,e,m.isA);this._impl.get(n.name).set(m.name,mf)}
        return cls
      }
      case 'TraitDecl':return null
      case 'ImplDecl':{
        const cn=n.forClass||n.tName;
        if(!this._impl.has(cn))this._impl.set(cn,new Map());
        for(const m of n.methods){const mf=new FLSFn(m.name,m.params,m.body,e,m.isA);this._impl.get(cn).set(m.name,mf)}
        return null
      }
      case 'New':{
        let cls;try{cls=e.get(n.cls)}catch{throw new Error(`Unknown class '${n.cls}'`)}
        if(!(cls instanceof FLSClass))throw new Error(`'${n.cls}' is not a class`);
        const fields={};
        for(const f of cls.fields)fields[f.n]=f.dflt?this.ev(f.dflt,e):0;
        const inst=new FLSInstance(cls,fields);
        const initFn=this._getM(n.cls,'init');
        if(initFn){const ie=new Env(initFn.cls);ie.def('self',inst);initFn.ps.filter(p=>p!=='self').forEach((p,i)=>{ie.def(p,n.args[i]!==undefined?this.ev(n.args[i],e):null)});this.ev(initFn.body,ie)}
        return inst
      }
      case 'Return':return new Ret(n.v?this.ev(n.v,e):null)
      case 'Show':{const v=this.ev(n.v,e);this.cb(this.fmt(v));return v}
      case 'If':{if(this.truthy(this.ev(n.cond,e)))return this.ev(n.then,new Env(e));if(n.els)return this.ev(n.els,e);return null}
      case 'While':{let i=0;while(this.truthy(this.ev(n.cond,e))){if(++i>1e5)throw new Error('Loop limit exceeded');const r=this.ev(n.body,new Env(e));if(r instanceof Ret)return r;if(r instanceof Brk)break;if(r instanceof Cnt)continue}return null}
      case 'Loop':{let i=0;for(;;){if(++i>1e5)throw new Error('Loop limit exceeded');const r=this.ev(n.body,new Env(e));if(r instanceof Ret)return r;if(r instanceof Brk)break;if(r instanceof Cnt)continue}return null}
      case 'For':{
        let items=this.ev(n.iter,e);
        if(items&&items.type==='RangeVal')items=Array.from({length:items.end-items.start},(_,i)=>i+items.start);
        if(!Array.isArray(items)){if(typeof items==='string')items=items.split('');else if(items&&typeof items==='object'&&!(items instanceof FLSInstance)&&!(items instanceof FLSEnum))items=Object.entries(items);else throw new Error('for..in needs iterable')}
        for(const item of items){const le=new Env(e);le.def(n.vn,item);const r=this.ev(n.body,le);if(r instanceof Ret)return r;if(r instanceof Brk)break;if(r instanceof Cnt)continue}
        return null
      }
      case 'Range':return{type:'RangeVal',start:this.ev(n.l,e),end:this.ev(n.r,e)}
      case 'Match':{
        const val=this.ev(n.e,e);
        for(const c of n.cases){
          let hit=false;const be=new Env(e);
          for(const p of c.pats){
            if(p.type==='Wild'){hit=true;break}
            if(p.type==='OkPat'&&val instanceof OkVal){be.def(p.b,val.v);hit=true;break}
            if(p.type==='ErrPat'&&val instanceof ErrVal){be.def(p.b,val.v);hit=true;break}
            if(p.type==='EnumPat'&&val instanceof FLSVariant&&val.enumName===p.ename&&val.name===p.vname){
              if(p.bindings)p.bindings.forEach((b,i)=>be.def(b,val.data[i]??0));
              hit=true;break
            }
            const pv=this.ev(p,e);if(val===pv){hit=true;break}
          }
          if(hit){const r=this.ev(c.body,be);if(r instanceof Ret)return r;return r}
        }
        return null
      }
      case 'Try':{try{return this.ev(n.body,new Env(e))}catch(err){const ce=new Env(e);ce.def(n.en,err.message||String(err));return this.ev(n.cb,ce)}}
      case 'Throw':throw new Error(this.fmt(this.ev(n.v,e)))
      case 'Scope':return this.ev(n.body,new Env(e))
      case 'Break':return new Brk()
      case 'Continue':return new Cnt()
      case 'Assign':{let v=this.ev(n.v,e);if(n.op!=='='){const c=e.get(n.name);v=this._ao(n.op,c,v)}e.set(n.name,v);return v}
      case 'MembAssign':{const o=this.ev(n.obj,e);let v=this.ev(n.v,e);if(n.op!=='=')v=this._ao(n.op,o instanceof FLSInstance?o.fields[n.prop]:o[n.prop],v);if(o instanceof FLSInstance)o.fields[n.prop]=v;else o[n.prop]=v;return v}
      case 'IdxAssign':{const o=this.ev(n.obj,e);const i=this.ev(n.idx,e);let v=this.ev(n.v,e);if(n.op!=='=')v=this._ao(n.op,o[i],v);o[i]=v;return v}
      case 'ExprStmt':return this.ev(n.e,e)
      case 'Bin':{
        if(n.op==='&&'){const l=this.ev(n.l,e);return this.truthy(l)?this.ev(n.r,e):l}
        if(n.op==='||'){const l=this.ev(n.l,e);return this.truthy(l)?l:this.ev(n.r,e)}
        const l=this.ev(n.l,e),r=this.ev(n.r,e);
        switch(n.op){
          case '+':return(typeof l==='string'||typeof r==='string')?this.fmt(l)+this.fmt(r):l+r;
          case '-':return l-r;case '*':return l*r;
          case '/':if(r===0)throw new Error('Division by zero');return l/r;
          case '%':return l%r;case '**':return Math.pow(l,r);
          case '==':return l===r||(l instanceof FLSVariant&&r instanceof FLSVariant&&l.enumName===r.enumName&&l.name===r.name);
          case '!=':return l!==r;case '<':return l<r;case '>':return l>r;case '<=':return l<=r;case '>=':return l>=r;
          default:throw new Error(`Unknown op: ${n.op}`)
        }
      }
      case 'Un':{const v=this.ev(n.e,e);return n.op==='-'?-v:!this.truthy(v)}
      case 'Await':return this.ev(n.e,e)
      case 'OkE':return new OkVal(this.ev(n.v,e))
      case 'ErrE':return new ErrVal(this.ev(n.v,e))
      case 'Call':{const f=e.get(n.fn);return this.callFn(f,n.args.map(a=>this.ev(a,e)),e)}
      case 'CallE':{const f=this.ev(n.fn,e);return this.callFn(f,n.args.map(a=>this.ev(a,e)),e)}
      case 'Meth':{const o=this.ev(n.obj,e);return this.callMeth(o,n.m,n.args.map(a=>this.ev(a,e)),e)}
      case 'SCall':{// Enum::Variant(data) or Class::staticMethod()
        const lhs=this.ev(n.cls,e);const args=n.args.map(a=>this.ev(a,e));
        if(lhs instanceof FLSEnum){
          const variant=lhs.variants.find(v=>v.name===n.m);
          if(!variant)throw new Error(`Unknown variant '${lhs.name}::${n.m}'`);
          return new FLSVariant(lhs.name,n.m,args)
        }
        if(lhs instanceof FLSClass){const m=this._getM(lhs.name,n.m);if(m)return this.callFn(m,args,e)}
        throw new Error(`Cannot call ::${n.m} on ${this.fmt(lhs)}`)
      }
      case 'SCMem':{// Enum::Variant (no args) or just access
        const lhs=this.ev(n.cls,e);
        if(lhs instanceof FLSEnum){
          const variant=lhs.variants.find(v=>v.name===n.m);
          if(variant)return new FLSVariant(lhs.name,n.m,[])
        }
        throw new Error(`Cannot access ::${n.m}`)
      }
      case 'Memb':{
        const o=this.ev(n.obj,e);
        if(o instanceof FLSInstance){if(n.prop in o.fields)return o.fields[n.prop];const m=this._getM(o.cls.name,n.prop);if(m)return m;throw new Error(`'${o.cls.name}' has no field '${n.prop}'`)}
        if(o instanceof OkVal&&n.prop==='value')return o.v;
        if(o instanceof ErrVal&&n.prop==='value')return o.v;
        if(Array.isArray(o)&&(n.prop==='len'||n.prop==='length'))return o.length;
        if(typeof o==='string'&&(n.prop==='len'||n.prop==='length'))return o.length;
        if(o&&typeof o==='object')return o[n.prop]!==undefined?o[n.prop]:null;
        return null
      }
      case 'Idx':{const o=this.ev(n.obj,e),i=this.ev(n.idx,e);if(Array.isArray(o)){const x=i<0?o.length+i:i;return x>=0&&x<o.length?o[x]:null}if(typeof o==='string')return o[i]??null;if(o&&typeof o==='object')return o[i]!==undefined?o[i]:null;throw new Error(`Cannot index ${typeof o}`)}
      case 'Lambda':return new FLSFn('<λ>',n.ps,n.b,e,false)
      case 'List':return n.items.map(it=>this.ev(it,e))
      case 'Dict':{const d={};for(const en of n.es)d[en.k]=this.ev(en.v,e);return d}
      case 'Tmpl':{let s=n.v,res='',i=0;while(i<s.length){if(s[i]==='\x01'){let expr='',j=i+1;while(j<s.length&&s[j]!=='\x02')expr+=s[j++];i=j+1;try{const v=this.ev(new Parser(new Lexer(expr).tokenize()).expr(),e);res+=this.fmt(v)}catch{res+='{err}'}}else res+=s[i++]}return res}
      case 'Ident':return e.get(n.n)
      case 'Num':return n.v;case 'Str':return n.v;case 'Bool':return n.v;case 'Null':return null;
      default:throw new Error(`Unknown node: ${n.type}`)
    }
  }
  _ao(op,a,b){switch(op){case'+=':return(typeof a==='string'||typeof b==='string')?this.fmt(a)+this.fmt(b):a+b;case'-=':return a-b;case'*=':return a*b;case'/=':return a/b}}
  _getM(cn,m){const mp=this._impl.get(cn);if(mp&&mp.has(m))return mp.get(m);return null}
  callFn(f,args,e){
    if(f&&f.__b__)return f.call(args);
    if(f instanceof FLSFn){const fe=new Env(f.cls);f.ps.forEach((p,i)=>fe.def(p,args[i]!==undefined?args[i]:null));const r=this.ev(f.body,fe);return r instanceof Ret?r.v:r}
    throw new Error(`Not callable: ${this.fmt(f)}`)
  }
  callMeth(o,m,args,e){
    if(o instanceof FLSInstance){const fn=this._getM(o.cls.name,m);if(fn){const fe=new Env(fn.cls);fe.def('self',o);fn.ps.filter(p=>p!=='self').forEach((p,i)=>fe.def(p,args[i]!==undefined?args[i]:null));const r=this.ev(fn.body,fe);return r instanceof Ret?r.v:r}throw new Error(`'${o.cls.name}' has no method '${m}'`)}
    if(o instanceof OkVal){if(m==='is_ok')return true;if(m==='is_err')return false;if(m==='unwrap')return o.v;if(m==='unwrap_or')return o.v;if(m==='map'){return new OkVal(this.callFn(args[0],[o.v],e))}}
    if(o instanceof ErrVal){if(m==='is_ok')return false;if(m==='is_err')return true;if(m==='unwrap')throw new Error(`Unwrap on Err: ${this.fmt(o.v)}`);if(m==='unwrap_or')return args[0];if(m==='map')return o}
    if(Array.isArray(o)){const s=this;switch(m){
      case'push':o.push(...args);return o;case'pop':return o.pop()??null;case'len':case'length':return o.length;
      case'map':return o.map(x=>s.callFn(args[0],[x],e));case'filter':return o.filter(x=>s.truthy(s.callFn(args[0],[x],e)));
      case'reduce':return o.reduce((acc,x)=>s.callFn(args[0],[acc,x],e),args[1]);
      case'find':return o.find(x=>s.truthy(s.callFn(args[0],[x],e)))??null;
      case'any':case'some':return o.some(x=>s.truthy(s.callFn(args[0],[x],e)));
      case'all':case'every':return o.every(x=>s.truthy(s.callFn(args[0],[x],e)));
      case'includes':case'contains':return o.includes(args[0]);
      case'join':return o.map(v=>s.fmt(v)).join(args[0]??'');
      case'reverse':return[...o].reverse();case'sort':return[...o].sort((a,b)=>a<b?-1:a>b?1:0);
      case'sortBy':return[...o].sort((a,b)=>{const va=s.callFn(args[0],[a],e),vb=s.callFn(args[0],[b],e);return va<vb?-1:va>vb?1:0});
      case'slice':return o.slice(args[0],args[1]);case'flat':return o.flat();
      case'first':return o[0]??null;case'last':return o[o.length-1]??null;
      case'sum':return o.reduce((a,b)=>a+b,0);case'max':return Math.max(...o);case'min':return Math.min(...o);
      case'unique':return[...new Set(o)];case'each':case'forEach':o.forEach(x=>s.callFn(args[0],[x],e));return null;
      case'count':return o.filter(x=>s.truthy(s.callFn(args[0],[x],e))).length;
      case'flat_map':return o.flatMap(x=>{const r=s.callFn(args[0],[x],e);return Array.isArray(r)?r:[r]});
      case'zip':return o.map((x,i)=>[x,args[0][i]??null]);
      case'take':return o.slice(0,args[0]);case'drop':return o.slice(args[0]);
      case'append':return[...o,args[0]];case'prepend':return[args[0],...o];
      default:throw new Error(`list.${m}() not found`)
    }}
    if(typeof o==='string'){switch(m){
      case'len':case'length':return o.length;case'upper':return o.toUpperCase();case'lower':return o.toLowerCase();
      case'trim':return o.trim();case'split':return o.split(args[0]??'');case'replace':return o.replace(args[0],args[1]??'');
      case'contains':case'includes':return o.includes(args[0]);case'starts_with':return o.startsWith(args[0]);case'ends_with':return o.endsWith(args[0]);
      case'slice':return o.slice(args[0],args[1]);case'repeat':return o.repeat(args[0]);case'chars':return o.split('');
      case'to_int':return parseInt(o);case'to_float':return parseFloat(o);
      default:throw new Error(`str.${m}() not found`)
    }}
    if(typeof o==='object'&&o!==null&&!Array.isArray(o)){switch(m){
      case'keys':return Object.keys(o);case'values':return Object.values(o);case'entries':return Object.entries(o).map(([k,v])=>[k,v]);
      case'has':case'contains':return Object.prototype.hasOwnProperty.call(o,args[0]);
      case'remove':case'delete':delete o[args[0]];return null;case'len':case'length':return Object.keys(o).length;
      case'merge':return Object.assign({},o,args[0]);
      default:throw new Error(`dict.${m}() not found`)
    }}
    throw new Error(`Cannot call .${m}() on ${typeof o}`)
  }
  run(src){return this.ev(new Parser(new Lexer(src).tokenize()).parse(),this.G)}
}

// ── HIGHLIGHTER ───────────────────────────────────────────────
function highlight(src){
  const P=[
    [/^(`(?:[^`\\]|\\.)*`)/,'str'],
    [/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,'str'],
    [/^(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)/,'cmt'],
    [/^(#include|#imp|#define|#ifdef|#ifndef|#endif)\b/,'dir'],
    [/^\b(let|const|fn|return|if|else|for|while|loop|match|try|catch|throw|async|await|scope|in|show|break|continue|class|trait|impl|self|new|enum|interface|type|from|import)\b/,'kw'],
    [/^\b(Ok|Err|true|false)\b/,'lit'],
    [/^\b(int|float|str|bool|list|dict|void|Self)\b/,'type'],
    [/^\b([A-Z][a-zA-Z0-9_]*)\b/,'type'],
    [/^\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/,'fn-name'],
    [/^\b\d+(\.\d+)?\b/,'num'],
    [/^(->|=>|\.\.|::|==|!=|<=|>=|&&|\|\||\+=|-=|\*=|\/=|\*\*)/,'op'],
    [/^[+\-*\/%<>=!&|.]/,'op'],
    [/^[(),{}\[\]:;]/,'punct'],
    [/^\s+/,null],
    [/^\b[a-zA-Z_][a-zA-Z0-9_]*\b/,'ident'],
    [/^./,null],
  ];
  let res='',rem=src;
  while(rem.length){let matched=false;for(const[pat,cls]of P){const m=rem.match(pat);if(m){const txt=m[0];const esc=txt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');res+=cls?`<span class="${cls}">${esc}</span>`:esc;rem=rem.slice(txt.length);matched=true;break}}if(!matched){res+=rem[0].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');rem=rem.slice(1)}}
  return res
}

// ── UI ────────────────────────────────────────────────────────

module.exports = { T, KW, TYPES, Lexer, Parser, Interp, highlight };
