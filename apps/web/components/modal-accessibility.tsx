"use client";

import {useEffect} from 'react';

const focusableSelector='button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function ModalAccessibility(){
 useEffect(()=>{
  let activeDialog:HTMLElement|null=null;
  let opener:HTMLElement|null=null;
  const closeDialog=(dialog:HTMLElement)=>{
   const close=dialog.querySelector<HTMLElement>('.modalClose')??dialog.querySelector<HTMLElement>('button');
   close?.click();
  };
  const activate=(dialog:HTMLElement)=>{
   if(activeDialog===dialog)return;
   opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
   activeDialog=dialog;
   dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('tabindex','-1');
   if(!dialog.hasAttribute('aria-label')&&!dialog.hasAttribute('aria-labelledby')){
    const heading=dialog.querySelector<HTMLElement>('h1,h2,h3');
    if(heading){heading.id ||= `dialog-title-${crypto.randomUUID()}`;dialog.setAttribute('aria-labelledby',heading.id)}
   }
   (dialog.querySelector<HTMLElement>(focusableSelector)??dialog).focus();
  };
  const scan=()=>{
   const dialog=document.querySelector<HTMLElement>('.sellerModal,.imageViewer');
   if(dialog)activate(dialog);else if(activeDialog){activeDialog=null;opener?.focus();opener=null}
  };
  const keydown=(event:KeyboardEvent)=>{
   if(!activeDialog)return;
   if(event.key==='Escape'){event.preventDefault();closeDialog(activeDialog);return}
   if(event.key!=='Tab')return;
   const focusable=[...activeDialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(element=>element.offsetParent!==null);
   if(!focusable.length){event.preventDefault();activeDialog.focus();return}
   const first=focusable[0],last=focusable.at(-1)!;
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  };
  const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('keydown',keydown);scan();
  return()=>{observer.disconnect();document.removeEventListener('keydown',keydown)};
 },[]);
 return null;
}
