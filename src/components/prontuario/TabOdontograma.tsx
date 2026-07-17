'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Patient, MedicalRecord } from '@/types'
import styles from './TabOdontograma.module.css'
import { Icon } from '@/components/ui/Icon'

// ── Status ──────────────────────────────────────────────────────
export const TOOTH_STATUS = [
  { key: 'higido',     label: 'Hígido',       color: '#10b981', bg: '#d1fae5' },
  { key: 'cariado',    label: 'Cariado',       color: '#ef4444', bg: '#fee2e2' },
  { key: 'restaurado', label: 'Restaurado',    color: '#3b82f6', bg: '#dbeafe' },
  { key: 'ausente',    label: 'Ausente',       color: '#6b7280', bg: '#f3f4f6' },
  { key: 'implante',   label: 'Implante',      color: '#f59e0b', bg: '#fef3c7' },
  { key: 'coroa',      label: 'Coroa',         color: '#14b8a6', bg: '#ccfbf1' },
  { key: 'tratamento', label: 'Em Tratamento', color: '#ec4899', bg: '#fce7f3' },
  { key: 'fraturado',  label: 'Fraturado',     color: '#ea580c', bg: '#ffedd5' },
  { key: 'selante',    label: 'Selante',       color: '#7c3aed', bg: '#ede9fe' },
]
function statusColor(k: string) { return TOOTH_STATUS.find(s => s.key === k)?.color ?? '#10b981' }
function statusBg(k: string)    { return TOOTH_STATUS.find(s => s.key === k)?.bg    ?? '#d1fae5' }

// ── FDI ─────────────────────────────────────────────────────────
const UPPER = [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28]
const LOWER = [48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38]
const DEFAULT_STATUS = 'higido'
function isUpper(n: number) { return n >= 11 && n <= 28 }

// ── Anatomy: viewBox 0 0 56 96 ────────────────────────────────
// Crown ≈ y=2–50; Root ≈ y=50–90. Upper teeth displayed scaleY(-1).
// Each path set contains: crown, root, incisal (translucency zone),
// grooves (developmental lines), shadow (inner contour offset inward)

interface ToothAnatomy {
  crown: string
  root: string
  incisal?: string    // semi-transparent zone at cusp/incisal tip
  grooves?: string    // developmental fissure lines
  shadow?: string     // slightly inset crown path for inner shadow
}

type ToothType = 'ci'|'li'|'ca'|'pm1'|'pm2'|'mo1'|'mo2'|'wi'

function toothType(num: number): ToothType {
  const p = num % 10
  if (p === 1) return 'ci'
  if (p === 2) return 'li'
  if (p === 3) return 'ca'
  if (p === 4) return 'pm1'
  if (p === 5) return 'pm2'
  if (p === 6) return 'mo1'
  if (p === 7) return 'mo2'
  return 'wi'
}

// Upper anatomy (viewed from labial, scaleY-1 in display → crown faces midline)
const UA: Record<ToothType, ToothAnatomy> = {
  ci: {
    crown:   'M 8,7 C 7,3 11,1 28,1 C 45,1 49,3 48,7 C 48,20 46,38 44,46 C 42,51 36,54 28,54 C 20,54 14,51 12,46 C 10,38 8,20 8,7 Z',
    shadow:  'M 12,9 C 11,5 14,4 28,4 C 42,4 45,5 44,9 C 44,20 42,38 40,45 C 38,49 33,52 28,52 C 23,52 18,49 16,45 C 12,38 12,20 12,9 Z',
    root:    'M 15,54 C 12,65 14,76 28,86 C 42,76 44,65 41,54 Z',
    incisal: 'M 8,7 C 7,3 11,1 28,1 C 45,1 49,3 48,7 L 46,24 C 38,18 18,18 10,24 Z',
    grooves: 'M 20,14 C 22,10 26,8 28,8 C 30,8 34,10 36,14',
  },
  li: {
    crown:   'M 12,8 C 11,3 14,1 28,1 C 42,1 45,3 44,8 C 44,20 42,36 40,45 C 38,50 33,53 28,53 C 23,53 18,50 16,45 C 14,36 12,20 12,8 Z',
    shadow:  'M 15,10 C 14,6 17,4 28,4 C 39,4 42,6 41,10 C 41,20 39,36 37,44 C 35,48 31,51 28,51 C 25,51 21,48 19,44 C 17,36 15,20 15,10 Z',
    root:    'M 16,53 C 14,64 15,75 28,84 C 41,75 42,64 40,53 Z',
    incisal: 'M 12,8 C 11,3 14,1 28,1 C 42,1 45,3 44,8 L 42,22 C 36,17 20,17 14,22 Z',
  },
  ca: {
    crown:   'M 10,16 C 9,7 14,1 28,1 C 42,1 47,7 46,16 C 46,26 44,40 42,48 C 40,53 35,56 28,56 C 21,56 16,53 14,48 C 12,40 10,26 10,16 Z',
    shadow:  'M 14,17 C 13,9 17,4 28,4 C 39,4 43,9 42,17 C 42,26 40,39 38,47 C 36,51 32,54 28,54 C 24,54 20,51 18,47 C 16,39 14,26 14,17 Z',
    root:    'M 14,56 C 11,67 13,79 28,90 C 43,79 45,67 42,56 Z',
    incisal: 'M 10,16 C 9,7 14,1 28,1 C 42,1 47,7 46,16 L 44,26 C 38,19 18,19 12,26 Z',
    grooves: 'M 28,4 L 28,48',
  },
  pm1: {
    crown:   'M 10,8 L 17,1 L 28,5 L 39,1 L 46,8 L 45,38 C 44,46 37,50 28,50 C 19,50 12,46 11,38 Z',
    shadow:  'M 14,10 L 19,4 L 28,8 L 37,4 L 42,10 L 41,37 C 40,44 34,47 28,47 C 22,47 16,44 15,37 Z',
    root:    'M 12,50 C 9,57 8,66 13,74 Q 18,80 21,74 Q 23,66 28,63 Q 33,66 35,74 Q 38,80 43,74 C 48,66 47,57 44,50 Z',
    grooves: 'M 28,8 L 28,44',
  },
  pm2: {
    crown:   'M 11,8 L 17,1 L 28,5 L 39,1 L 45,8 L 44,38 C 43,46 37,50 28,50 C 19,50 13,46 12,38 Z',
    shadow:  'M 15,10 L 19,4 L 28,8 L 37,4 L 41,10 L 40,37 C 39,44 34,47 28,47 C 22,47 17,44 16,37 Z',
    root:    'M 14,50 C 11,61 12,73 28,83 C 44,73 45,61 42,50 Z',
    grooves: 'M 28,8 L 28,44',
  },
  mo1: {
    crown:   'M 4,9 L 13,1 L 21,5 L 28,3 L 35,5 L 43,1 L 52,9 L 51,37 C 50,46 40,50 28,50 C 16,50 6,46 5,37 Z',
    shadow:  'M 8,11 L 15,4 L 22,8 L 28,6 L 34,8 L 41,4 L 48,11 L 47,36 C 46,44 38,47 28,47 C 18,47 10,44 9,36 Z',
    root:    'M 6,50 C 4,58 3,68 8,76 Q 13,82 17,75 Q 21,67 26,65 Q 28,67 30,65 Q 35,67 39,75 Q 43,82 48,76 C 53,68 52,58 50,50 Z',
    grooves: 'M 28,5 L 28,44 M 17,10 Q 20,7 23,10 M 33,10 Q 36,7 39,10',
  },
  mo2: {
    crown:   'M 6,9 L 14,1 L 22,5 L 28,3 L 34,5 L 42,1 L 50,9 L 49,37 C 48,45 39,50 28,50 C 17,50 8,45 7,37 Z',
    shadow:  'M 10,11 L 16,4 L 23,8 L 28,6 L 33,8 L 40,4 L 46,11 L 45,36 C 44,43 37,47 28,47 C 19,47 12,43 11,36 Z',
    root:    'M 8,50 C 6,58 5,67 10,75 Q 15,81 19,74 Q 22,66 28,64 Q 34,66 37,74 Q 41,81 46,75 C 51,67 50,58 48,50 Z',
    grooves: 'M 28,5 L 28,44',
  },
  wi: {
    crown:   'M 11,10 C 11,3 16,0 28,0 C 40,0 45,3 45,10 L 44,34 C 43,44 37,48 28,48 C 19,48 13,44 12,34 Z',
    shadow:  'M 15,12 C 15,6 19,3 28,3 C 37,3 41,6 41,12 L 40,33 C 39,42 34,45 28,45 C 22,45 17,42 16,33 Z',
    root:    'M 13,48 C 10,59 12,71 28,82 C 44,71 46,59 43,48 Z',
  },
}

// Lower anatomy
const LA: Record<ToothType, ToothAnatomy> = {
  ci: {
    crown:   'M 13,7 C 12,3 15,1 28,1 C 41,1 44,3 43,7 C 43,20 41,35 39,43 C 37,49 33,52 28,52 C 23,52 19,49 17,43 C 15,35 13,20 13,7 Z',
    shadow:  'M 16,9 C 15,5 18,3 28,3 C 38,3 41,5 40,9 C 40,20 38,34 36,42 C 34,47 31,50 28,50 C 25,50 22,47 20,42 C 18,34 16,20 16,9 Z',
    root:    'M 18,52 C 15,63 17,74 28,83 C 39,74 41,63 38,52 Z',
    incisal: 'M 13,7 C 12,3 15,1 28,1 C 41,1 44,3 43,7 L 41,22 C 35,17 21,17 15,22 Z',
  },
  li: {
    crown:   'M 12,8 C 11,3 14,1 28,1 C 42,1 45,3 44,8 C 44,20 42,35 40,43 C 38,49 34,52 28,52 C 22,52 18,49 16,43 C 14,35 12,20 12,8 Z',
    shadow:  'M 15,10 C 14,6 17,4 28,4 C 39,4 42,6 41,10 C 41,20 39,34 37,42 C 35,47 32,50 28,50 C 24,50 21,47 19,42 C 17,34 15,20 15,10 Z',
    root:    'M 17,52 C 14,63 15,74 28,83 C 41,74 42,63 39,52 Z',
    incisal: 'M 12,8 C 11,3 14,1 28,1 C 42,1 45,3 44,8 L 42,22 C 36,17 20,17 14,22 Z',
  },
  ca: {
    crown:   'M 11,14 C 10,6 14,1 28,1 C 42,1 46,6 45,14 C 45,25 43,38 41,47 C 39,52 34,55 28,55 C 22,55 17,52 15,47 C 13,38 11,25 11,14 Z',
    shadow:  'M 15,15 C 14,8 17,4 28,4 C 39,4 42,8 41,15 C 41,25 39,37 37,45 C 35,50 32,53 28,53 C 24,53 21,50 19,45 C 17,37 15,25 15,15 Z',
    root:    'M 15,55 C 12,66 13,78 28,88 C 43,78 44,66 41,55 Z',
    incisal: 'M 11,14 C 10,6 14,1 28,1 C 42,1 46,6 45,14 L 43,24 C 37,18 19,18 13,24 Z',
  },
  pm1: {
    crown:   'M 11,9 L 18,1 L 28,5 L 38,1 L 45,9 L 44,37 C 43,45 37,49 28,49 C 19,49 13,45 12,37 Z',
    shadow:  'M 15,11 L 20,4 L 28,8 L 36,4 L 41,11 L 40,36 C 39,43 34,46 28,46 C 22,46 17,43 16,36 Z',
    root:    'M 14,49 C 11,60 12,72 28,81 C 44,72 45,60 42,49 Z',
  },
  pm2: {
    crown:   'M 11,9 L 17,1 L 28,5 L 39,1 L 45,9 L 44,37 C 43,45 37,49 28,49 C 19,49 13,45 12,37 Z',
    shadow:  'M 15,11 L 19,4 L 28,8 L 37,4 L 41,11 L 40,36 C 39,43 34,46 28,46 C 22,46 17,43 16,36 Z',
    root:    'M 14,49 C 11,60 12,72 28,81 C 44,72 45,60 42,49 Z',
    grooves: 'M 28,8 L 28,43',
  },
  mo1: {
    crown:   'M 5,9 L 13,1 L 21,5 L 28,2 L 35,5 L 43,1 L 51,9 L 50,36 C 49,45 40,49 28,49 C 16,49 7,45 6,36 Z',
    shadow:  'M 9,11 L 15,4 L 22,8 L 28,5 L 34,8 L 41,4 L 47,11 L 46,35 C 45,43 38,46 28,46 C 18,46 11,43 10,35 Z',
    root:    'M 7,49 C 5,57 4,67 9,75 Q 14,81 18,74 Q 22,66 28,64 Q 34,66 38,74 Q 42,81 47,75 C 52,67 51,57 49,49 Z',
    grooves: 'M 15,8 L 15,40 M 28,3 L 28,42 M 41,8 L 41,40',
  },
  mo2: {
    crown:   'M 7,9 L 14,1 L 22,5 L 28,3 L 34,5 L 42,1 L 49,9 L 48,36 C 47,44 39,49 28,49 C 17,49 9,44 8,36 Z',
    shadow:  'M 11,11 L 16,4 L 23,8 L 28,6 L 33,8 L 40,4 L 45,11 L 44,35 C 43,43 37,46 28,46 C 19,46 13,43 12,35 Z',
    root:    'M 9,49 C 7,57 6,67 11,74 Q 15,80 19,73 Q 23,65 28,63 Q 33,65 37,73 Q 41,80 45,74 C 50,67 49,57 47,49 Z',
    grooves: 'M 28,5 L 28,43',
  },
  wi: {
    crown:   'M 10,10 C 10,3 15,0 28,0 C 41,0 46,3 46,10 L 45,33 C 44,43 38,47 28,47 C 18,47 12,43 11,33 Z',
    shadow:  'M 14,12 C 14,6 18,3 28,3 C 38,3 42,6 42,12 L 41,32 C 40,41 35,44 28,44 C 21,44 16,41 15,32 Z',
    root:    'M 12,47 C 9,58 11,70 28,81 C 45,70 47,58 44,47 Z',
  },
}

function getAnatomy(num: number): ToothAnatomy {
  const t = toothType(num)
  return (isUpper(num) ? UA : LA)[t]
}

// ── Surface data ─────────────────────────────────────────────────
type SurfaceKey = 'v'|'l'|'m'|'d'|'o'
const SURFACES: {key:SurfaceKey;label:string;x:number;y:number;w:number;h:number}[] = [
  {key:'v',label:'V',x:13,y:2, w:14,h:12},
  {key:'l',label:'L',x:13,y:26,w:14,h:12},
  {key:'m',label:'M',x:2, y:13,w:12,h:14},
  {key:'d',label:'D',x:26,y:13,w:12,h:14},
  {key:'o',label:'O',x:13,y:13,w:14,h:14},
]

interface ToothData { status: string; surfaces: Record<SurfaceKey,string> }
function emptyTooth(): ToothData {
  return { status: DEFAULT_STATUS, surfaces: {v:'higido',l:'higido',m:'higido',d:'higido',o:'higido'} }
}

// ── Photorealistic ToothSVG ───────────────────────────────────────
function ToothSVG({ num, data, selected, onClick }: {
  num: number; data: ToothData; selected: boolean; onClick: () => void
}) {
  const upper  = isUpper(num)
  const { crown, shadow, root, incisal, grooves } = getAnatomy(num)
  const status = data.status
  const absent = status === 'ausente'
  const g      = `t${num}`

  return (
    <button type="button"
      className={`${styles.toothBtn} ${selected ? styles.toothBtnSelected : ''}`}
      onClick={onClick}
      title={`Dente ${num} — ${TOOTH_STATUS.find(s=>s.key===status)?.label ?? status}`}
    >
      <svg viewBox="0 0 56 96" className={styles.toothSvg}
        style={{ transform: upper ? 'scaleY(-1)' : 'none' }}>
        <defs>
          {/* Dentin core: warm amber-orange glow (subsurface scattering) */}
          <radialGradient id={`dt${g}`} cx="42%" cy="38%" r="62%" fx="42%" fy="30%">
            <stop offset="0%"   stopColor="#D4935A"/>
            <stop offset="28%"  stopColor="#C07A38"/>
            <stop offset="60%"  stopColor="#A05E20"/>
            <stop offset="100%" stopColor="#7A4010"/>
          </radialGradient>
          {/* Enamel body: semi-transparent warm ivory — dentin shows through */}
          <linearGradient id={`en${g}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#8C7E66" stopOpacity="0.96"/>
            <stop offset="10%"  stopColor="#C4B898" stopOpacity="0.91"/>
            <stop offset="35%"  stopColor="#F5F0E6" stopOpacity="0.86"/>
            <stop offset="60%"  stopColor="#EDE4CC" stopOpacity="0.89"/>
            <stop offset="88%"  stopColor="#C0B090" stopOpacity="0.93"/>
            <stop offset="100%" stopColor="#8C7E66" stopOpacity="0.96"/>
          </linearGradient>
          {/* Root cementum: darker warm brown */}
          <linearGradient id={`ro${g}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#5A3818"/>
            <stop offset="22%"  stopColor="#8A5A28"/>
            <stop offset="50%"  stopColor="#A06830"/>
            <stop offset="78%"  stopColor="#7A4C20"/>
            <stop offset="100%" stopColor="#5A3818"/>
          </linearGradient>
          {/* Incisal/occlusal translucency: strong blue-gray at cusp/edge */}
          <linearGradient id={`ic${g}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#6898B8" stopOpacity="0.60"/>
            <stop offset="35%"  stopColor="#88B0CC" stopOpacity="0.22"/>
            <stop offset="75%"  stopColor="#AACCE0" stopOpacity="0.05"/>
            <stop offset="100%" stopColor="#FFFFFF"  stopOpacity="0"/>
          </linearGradient>
          {/* Cervical stain: warm amber at gum margin */}
          <linearGradient id={`cv${g}`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%"   stopColor="#9A6020" stopOpacity="0.40"/>
            <stop offset="22%"  stopColor="#B87838" stopOpacity="0.15"/>
            <stop offset="55%"  stopColor="#D09050" stopOpacity="0.03"/>
            <stop offset="100%" stopColor="#FFFFFF"  stopOpacity="0"/>
          </linearGradient>
          {/* Mesial/distal contact shadows */}
          <linearGradient id={`ms${g}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(30,18,8,0.22)"/>
            <stop offset="16%"  stopColor="rgba(30,18,8,0)"/>
            <stop offset="84%"  stopColor="rgba(30,18,8,0)"/>
            <stop offset="100%" stopColor="rgba(30,18,8,0.18)"/>
          </linearGradient>
          {/* Lingual/inner shadow (top-to-bottom dark band at upper portion) */}
          <linearGradient id={`ls${g}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="rgba(20,12,4,0.14)"/>
            <stop offset="30%"  stopColor="rgba(20,12,4,0)"/>
            <stop offset="100%" stopColor="rgba(20,12,4,0)"/>
          </linearGradient>
          {/* Primary specular: bright elongated highlight */}
          <radialGradient id={`sp${g}`} cx="43%" cy="23%" r="26%" fx="43%" fy="16%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.95)"/>
            <stop offset="28%"  stopColor="rgba(255,255,255,0.60)"/>
            <stop offset="65%"  stopColor="rgba(255,255,255,0.15)"/>
            <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
          </radialGradient>
          {/* Secondary fill light: cool blue-white from above-left */}
          <radialGradient id={`fl${g}`} cx="18%" cy="12%" r="52%">
            <stop offset="0%"   stopColor="rgba(220,238,255,0.35)"/>
            <stop offset="55%"  stopColor="rgba(220,238,255,0.08)"/>
            <stop offset="100%" stopColor="rgba(220,238,255,0)"/>
          </radialGradient>
          {/* Status tint overlay */}
          {!absent && status !== 'higido' && (
            <radialGradient id={`st${g}`} cx="50%" cy="45%" r="58%">
              <stop offset="0%"   stopColor={statusColor(status)} stopOpacity="0.55"/>
              <stop offset="60%"  stopColor={statusColor(status)} stopOpacity="0.32"/>
              <stop offset="100%" stopColor={statusColor(status)} stopOpacity="0.18"/>
            </radialGradient>
          )}
        </defs>

        {/* ROOT */}
        {absent ? (
          <path d={root} fill="#C0BAA8" stroke="#988C7C" strokeWidth="0.7" strokeDasharray="3,2"/>
        ) : (
          <path d={root} fill={`url(#ro${g})`} stroke="#4E2E0C" strokeWidth="0.9"/>
        )}

        {/* CROWN */}
        {absent ? (
          <>
            <path d={crown} fill="#DDDBD2" stroke="#B8B0A8" strokeWidth="1.2" strokeDasharray="3,2" opacity="0.7"/>
            <line x1="15" y1="8" x2="41" y2="44" stroke="#A8A098" strokeWidth="2.5" strokeLinecap="round" opacity="0.7"/>
            <line x1="41" y1="8" x2="15" y2="44" stroke="#A8A098" strokeWidth="2.5" strokeLinecap="round" opacity="0.7"/>
          </>
        ) : (
          <>
            {/* 1. Dentin core — warm amber subsurface (shows through translucent enamel) */}
            {shadow
              ? <path d={shadow} fill={`url(#dt${g})`}/>
              : <path d={crown} fill={`url(#dt${g})`} opacity="0.92"/>
            }
            {/* 2. Enamel body — semi-transparent ivory, reveals dentin warmth */}
            <path d={crown} fill={`url(#en${g})`} stroke="#A09070" strokeWidth="1.2" strokeLinejoin="round"/>
            {/* 3. Incisal / occlusal translucency — blue-gray at cutting edge */}
            {incisal && <path d={incisal} fill={`url(#ic${g})`}/>}
            {/* 4. Cervical stain — amber tint at gum line */}
            <path d={crown} fill={`url(#cv${g})`}/>
            {/* 5. Mesial/distal contact shadows — darkens the tooth sides */}
            <path d={crown} fill={`url(#ms${g})`}/>
            {/* 6. Lingual shadow band — slight darkness at upper crown */}
            <path d={crown} fill={`url(#ls${g})`}/>
            {/* 7. Status color overlay */}
            {status !== 'higido' && (
              <path d={crown} fill={`url(#st${g})`}/>
            )}
            {/* 8. Anatomical grooves — fissures in enamel */}
            {grooves && (
              <path d={grooves} fill="none" stroke="#6A5840" strokeWidth="0.9" strokeLinecap="round" opacity="0.50"/>
            )}
            {/* 9. Secondary fill light — cool reflection from above-left */}
            <path d={crown} fill={`url(#fl${g})`}/>
            {/* 10. Primary specular highlight — bright gloss on labial convexity */}
            <path d={crown} fill={`url(#sp${g})`}/>
          </>
        )}

        {/* SELECTION RING */}
        {selected && (
          <path d={crown} fill="none" stroke="#4DD9C0" strokeWidth="3" strokeLinejoin="round" opacity="0.88"/>
        )}
      </svg>
      <span className={styles.toothNumber}>{num}</span>
    </button>
  )
}

// ── Surface diagram ───────────────────────────────────────────────
function SurfaceDiagram({ data, activeSurface, onSurfaceClick }: {
  data: ToothData; activeSurface: SurfaceKey|null; onSurfaceClick:(s:SurfaceKey)=>void
}) {
  return (
    <svg viewBox="0 0 40 40" className={styles.surfaceDiagram}>
      {SURFACES.map(s => (
        <rect key={s.key} x={s.x} y={s.y} width={s.w} height={s.h} rx="2"
          fill={statusBg(data.surfaces[s.key]??DEFAULT_STATUS)}
          stroke={activeSurface===s.key?'#4DD9C0':statusColor(data.surfaces[s.key]??DEFAULT_STATUS)}
          strokeWidth={activeSurface===s.key?2.4:1.4}
          style={{cursor:'pointer'}} onClick={()=>onSurfaceClick(s.key)}/>
      ))}
      {SURFACES.map(s => (
        <text key={s.key+'t'} x={s.x+s.w/2} y={s.y+s.h/2+3.5} textAnchor="middle"
          fontSize="7" fontWeight="700" fill={statusColor(data.surfaces[s.key]??DEFAULT_STATUS)}
          style={{pointerEvents:'none',userSelect:'none'}}>{s.label}</text>
      ))}
    </svg>
  )
}

// ── Props / Main ──────────────────────────────────────────────────
interface Props { record: MedicalRecord|null; patient: Patient; clinicId: string; onSaved: ()=>void }

export function TabOdontograma({ record, patient, clinicId, onSaved }: Props) {
  const [teeth, setTeeth]             = useState<Record<number,ToothData>>({})
  const [selectedTooth, setSelected]  = useState<number|null>(null)
  const [activeSurface, setActiveSurf]= useState<SurfaceKey|null>(null)
  const [paintStatus, setPaint]       = useState<string>('cariado')
  const [mode, setMode]               = useState<'dente'|'face'>('dente')
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)

  useEffect(() => {
    const raw = (record?.odontogram??{}) as Record<string,unknown>
    const loaded: Record<number,ToothData> = {}
    for (const num of [...UPPER,...LOWER]) {
      const v = raw[num]
      if (!v) loaded[num]=emptyTooth()
      else if (typeof v==='string') loaded[num]={...emptyTooth(),status:v}
      else loaded[num]={...emptyTooth(),...(v as Partial<ToothData>)}
    }
    setTeeth(loaded)
  }, [record])

  function handleToothClick(num: number) {
    if (selectedTooth===num) {
      setTeeth(p=>({...p,[num]:{...p[num],status:paintStatus}}))
      setSelected(null); return
    }
    setSelected(num); setActiveSurf(null)
  }
  function handleSurfaceClick(s: SurfaceKey) {
    if (selectedTooth===null) return
    setActiveSurf(s)
    setTeeth(p=>({...p,[selectedTooth]:{...p[selectedTooth],surfaces:{...p[selectedTooth].surfaces,[s]:paintStatus}}}))
  }
  function applyStatus(status: string) {
    if (selectedTooth===null) return
    if (mode==='dente') setTeeth(p=>({...p,[selectedTooth]:{...p[selectedTooth],status}}))
    else if (activeSurface) setTeeth(p=>({...p,[selectedTooth]:{...p[selectedTooth],surfaces:{...p[selectedTooth].surfaces,[activeSurface]:status}}}))
    setSelected(null); setActiveSurf(null)
  }
  async function handleSave() {
    setSaving(true)
    const payload={clinic_id:clinicId,patient_id:patient.id,
      odontogram:teeth as Record<string,{status:string;surfaces?:Record<string,string>}>,
      updated_at:new Date().toISOString()}
    if (record?.id) await supabase.from('medical_records').update(payload).eq('id',record.id)
    else await supabase.from('medical_records').insert([payload])
    setSaved(true); setTimeout(()=>setSaved(false),2500)
    setSaving(false); onSaved()
  }

  const selData = selectedTooth!==null ? teeth[selectedTooth] : null

  return (
    <div className={styles.wrap}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarLabel}>Pintar:</span>
          {TOOTH_STATUS.map(s=>(
            <button key={s.key} type="button"
              className={`${styles.paintBtn} ${paintStatus===s.key?styles.paintBtnActive:''}`}
              style={{'--paint-color':s.color,'--paint-bg':s.bg} as React.CSSProperties}
              onClick={()=>setPaint(s.key)} title={s.label}>
              <span className={styles.paintDot} style={{background:s.color}}/>
              <span className={styles.paintLabel}>{s.label}</span>
            </button>
          ))}
        </div>
        <div className={styles.modeSwitch}>
          <button type="button" className={`${styles.modeBtn} ${mode==='dente'?styles.modeBtnActive:''}`} onClick={()=>setMode('dente')}>Dente</button>
          <button type="button" className={`${styles.modeBtn} ${mode==='face'?styles.modeBtnActive:''}`}  onClick={()=>setMode('face')}>Face</button>
        </div>
      </div>

      {/* Arcade */}
      <div className={styles.arcade}>
        <div className={styles.arcadeLabel}>Superior</div>
        <div className={styles.teethRow}>
          {UPPER.map(n=><ToothSVG key={n} num={n} data={teeth[n]??emptyTooth()} selected={selectedTooth===n} onClick={()=>handleToothClick(n)}/>)}
        </div>
        <div className={styles.midline}/>
        <div className={styles.teethRow}>
          {LOWER.map(n=><ToothSVG key={n} num={n} data={teeth[n]??emptyTooth()} selected={selectedTooth===n} onClick={()=>handleToothClick(n)}/>)}
        </div>
        <div className={styles.arcadeLabel}>Inferior</div>
      </div>

      {/* Selection panel */}
      {selectedTooth!==null && selData && (
        <div className={styles.selPanel}>
          <div className={styles.selPanelHeader}>
            <span className={styles.selPanelTitle}>Dente {selectedTooth}</span>
            <button type="button" className={styles.selPanelClose} onClick={()=>{setSelected(null);setActiveSurf(null)}}><Icon name="close" size={16} /></button>
          </div>
          <div className={styles.selPanelBody}>
            <div className={styles.selPanelLeft}>
              <p className={styles.selPanelSub}>Faces</p>
              <SurfaceDiagram data={selData} activeSurface={activeSurface} onSurfaceClick={handleSurfaceClick}/>
              <p className={styles.selPanelHint}>{activeSurface?`Face: ${SURFACES.find(s=>s.key===activeSurface)?.label}`:'Clique em uma face'}</p>
            </div>
            <div className={styles.selPanelRight}>
              <p className={styles.selPanelSub}>{mode==='dente'?'Status do dente':'Status da face selecionada'}</p>
              <div className={styles.statusGrid}>
                {TOOTH_STATUS.map(s=>{
                  const isCurr=mode==='dente'?selData.status===s.key:!!(activeSurface&&selData.surfaces[activeSurface]===s.key)
                  return (
                    <button key={s.key} type="button"
                      className={`${styles.statusBtn} ${isCurr?styles.statusBtnActive:''}`}
                      style={{'--st-color':s.color,'--st-bg':s.bg} as React.CSSProperties}
                      onClick={()=>applyStatus(s.key)}>
                      <span className={styles.statusDot} style={{background:s.color}}/>{s.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className={styles.legend}>
        {TOOTH_STATUS.map(s=>(
          <span key={s.key} className={styles.legendItem}>
            <span className={styles.legendDot} style={{background:s.color}}/>{s.label}
          </span>
        ))}
      </div>

      {/* Save */}
      <div className={styles.saveRow}>
        {saved&&<span className={styles.savedMsg}><Icon name="check" size={12} /> Salvo com sucesso!</span>}
        <button type="button" className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving?'Salvando...':'Salvar Odontograma'}
        </button>
      </div>
    </div>
  )
}
