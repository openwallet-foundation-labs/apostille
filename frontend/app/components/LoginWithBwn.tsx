'use client'

import Image from "next/image";
import Button from "./ui/Button";
import { useRouter } from "next/navigation";

interface LoginWithBwnProps{

}

export default function LoginWithBwn({}:LoginWithBwnProps ){
    const router = useRouter()

    // Get current domain's API URL for OAuth callback
    const getApiUrl = () => {
        // Use environment variable - should be set in production
        return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    };

    return(
        <div className=' w-full'>

            <Seperator/>

            <Button onClick={()=>router.push(`${process.env.NEXT_PUBLIC_BWN_URL}?callback_url=${encodeURIComponent(getApiUrl()+'/api/auth/bwn/callback')}`)} className=" w-full items-center gap-2">
                <Image unoptimized src={'BWN-Logo.svg'} alt="BWN-LOGO" width={20} height={20} />
                <p>
                    Login With BWN
                </p>
            </Button>
        </div>
    )
}


function Seperator(){
    return(
        <div className="flex items-center gap-4 my-6">
            <div className='w-full h-[2px] bg-primary/20'/>
            <p>OR</p>
            <div className='w-full h-[2px] bg-primary/20'/>
        </div>
    )
}
