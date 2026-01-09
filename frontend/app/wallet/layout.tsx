'use client'

import { AnimatePresence,motion } from "framer-motion"
import { usePathname } from "next/navigation"
import { ReactNode } from "react"

interface layoutProps{
    children:ReactNode
}

export default function DigitalTrustLayout({children}:layoutProps ){
    const pathname = usePathname()
    // alert(pathname)
    return(
        // <AnimatePresence mode='wait'>
            <motion.div className=' w-full min-h-screen flex justify-center items-center gap-5' exit={{opacity:0}} initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.3}} key={pathname}>
                {children}
            </motion.div>
        // </AnimatePresence>
    )
}