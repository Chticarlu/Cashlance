'use client'
import {useEffect,useState} from 'react'
export default function ThemeToggle(){
 const [theme,setTheme]=useState<'dark'|'light'>('dark')
 useEffect(()=>{
  const stored=localStorage.getItem('cashlance-theme')
  const next=stored==='light'?'light':'dark'
  setTheme(next);document.documentElement.dataset.theme=next
 },[])
 function toggle(){
  const next=theme==='dark'?'light':'dark'
  setTheme(next);document.documentElement.dataset.theme=next;localStorage.setItem('cashlance-theme',next)
 }
 return <button type="button" className="theme-toggle" onClick={toggle} aria-label={theme==='dark'?'Activer le mode clair':'Activer le mode sombre'}>{theme==='dark'?'☀ Mode clair':'☾ Mode sombre'}</button>
}
