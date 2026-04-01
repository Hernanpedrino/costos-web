'use client';
import Image from 'next/image'
export const Login = () => {
  return (
    <div className="w-full h-screen flex items-center justify-center">
        <form className="w-full md:w-1/3 border rounded-lg shadow-xl">
          <div className="flex font-bold justify-center my-6">
            <Image
              src="https://dummyimage.com/64x64"
              alt="Picture of the author"
              width={64}
              height={64}
            />
          </div>
          <h2 className="text-2xl text-center font-bold mb-8">Login</h2>
          <div className="px-12 pb-10">
            <div className="w-full mb-2">
              <div className="flex items-center">
                <input
                  type="text"
                  placeholder="Email Address"
                  className="
                      w-full
                      border
                      rounded
                      px-3
                      py-2
                      text-gray-700
                      focus:outline-none
                    "
                />
              </div>
            </div>
            <div className="w-full mb-2">
              <div className="flex items-center">
                <input
                  type="password"
                  placeholder="Password"
                  className="
                      w-full
                      border
                      rounded
                      px-3
                      py-2
                      text-gray-700
                      focus:outline-none
                    "
                />
              </div>
            </div>
            <button
              type="submit"
              className="
                  w-full
                  py-2
                  mt-8
                  rounded-full
                  bg-green-800
                  text-white
                  focus:outline-none
                "
            >
              Login
            </button>
          </div>
        </form>
      </div>
  )
}
