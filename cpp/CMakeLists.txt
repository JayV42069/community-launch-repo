# CMakeLists.txt — Education Boilerplate C++ MT5 Bridge
#
# This is a SIMPLIFIED version of the @deepcharts/core-bridge for
# educational purposes. Every line is commented to explain what it does.

cmake_minimum_required(VERSION 3.15)
project(education_bridge LANGUAGES CXX)

# C++17 is required for std::thread, std::chrono, etc.
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(WIN32)
    # Winsock2 is the Windows socket library
    set(PLATFORM_LIBS ws2_32)
    add_compile_definitions(WIN32_LEAN_AND_MEAN _CRT_SECURE_NO_WARNINGS)
else()
    # On Linux/macOS we link against pthread for std::thread
    find_package(Threads REQUIRED)
    set(PLATFORM_LIBS Threads::Threads)
endif()

add_executable(bridge_client src/bridge_client.cpp)
target_include_directories(bridge_client PRIVATE include)
target_link_libraries(bridge_client PRIVATE ${PLATFORM_LIBS})
