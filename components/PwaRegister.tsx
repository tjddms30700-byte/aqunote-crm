"use client";
import {useEffect} from 'react';
export default function PwaRegister(){useEffect(()=>{if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});},[]);return null;}
