import OfficeConsole from '@/components/OfficeConsole';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'AI 오피스 관제실 | 아쿠노트',robots:{index:false,follow:false}};
export default function OfficePage(){return <OfficeConsole/>;}
