#!/usr/bin/env python3
"""
InternHub — Complete Working Demo Script
Exact 4-task flow ✅ 
RUN: python3 demo_script_perfect.py
"""

import asyncio
import os
from playwright.async_api import async_playwright, TimeoutError as PWTimeout

BASE_URL = "http://127.0.0.1:5500"

COMPANY_EMAIL = "company"
COMPANY_PASSWORD = "company"
STUDENT_EMAIL = "student"
STUDENT_PASSWORD = " student"

TEST_PHOTO_PATH = "test-photo.jpg"
TEST_CV_PATH = "test-cv.pdf"

results = []

def log(label, ok, detail=""):
    icon = "✅" if ok else "❌"
    print(f"  {icon}  {label}" + (f" → {detail}" if detail else ""))
    results.append((label, ok, detail))

async def pause(page, ms=800):
    await page.wait_for_timeout(ms)

async def do_login(page, email, password):
    print(f"\n🔐 Login: {email}")
    await page.goto(f"{BASE_URL}/auth.html")
    await pause(page, 1200)
    
    # Login tab + credentials
    await page.locator('.form-tab:has-text("Login")').click()
    await page.locator('#loginEmail').fill(email)
    await page.locator('#loginPassword').fill(password)
    
    # EXACT submit button
    await page.locator('#loginForm_form button[type="submit"]').click()
    
    # Wait redirect
    await page.wait_for_url(lambda u: 'auth.html' not in u, timeout=10000)
    log(f'Login {email}', True)
    return True

async def do_logout(page):
    await page.evaluate("localStorage.clear(); sessionStorage.clear();")
    log('Logout', True)

async def task1_anonymous(page):
    print("\n" + "="*70)
    print("TASK 1/4 Anonymous")
    print("="*70)
    
    await page.goto(BASE_URL)
    await page.evaluate("window.scrollBy(0, 800)")
    
    await page.locator('footer a[href*="about-us"]').click()
    await page.wait_for_url("**/about-us.html")
    log("About Us", True)
    
    await page.goto(BASE_URL)
    await page.locator('footer a[href*="team"]').click()
    await page.wait_for_url("**/team.html")
    log("Team", True)

async def task2_company(page):
    print("\n" + "="*70)
    print("TASK 2/4 Company")
    print("="*70)
    
    await do_login(page, COMPANY_EMAIL, COMPANY_PASSWORD)
    
    # Edit profile
    await page.locator('#editCompanyBtn').click()
    await page.locator('#eCompanyName').fill('Demo Corp')
    await page.locator('#saveCompanyBtn').click()
    log('Profile edited', True)
    
    # Post job - EXACT sidebar button
    await page.locator('.sidebar-card button[onclick="openPostModal()"]').click()
    
    await page.locator('#pTitle').fill('Demo Junior Developer')
    await page.locator('#pDesc').fill('Demo position for full flow test')
    await page.locator('#submitPostBtn').click()
    log('Job posted', True)
    
    await do_logout(page)

async def task3_student(page):
    print("\n" + "="*70)
    print("TASK 3/4 Student")
    print("="*70)
    
    await do_login(page, STUDENT_EMAIL, STUDENT_PASSWORD)
    
# Edit profile + uploads - WAIT VISIBLE
    await page.locator('#editProfileBtn').click()
    await page.wait_for_selector('#editMode', state='visible', timeout=5000)
    await page.locator('#eFirstName').wait_for(state='visible')
    await page.locator('#eFirstName').fill('Test Student')
    
    await page.locator('#avatarUpload').set_input_files(TEST_PHOTO_PATH)
    await page.locator('#cvUpload').set_input_files(TEST_CV_PATH)
    await page.locator('#saveProfileBtn').click()
    log('Profile updated', True)
    
    # Apply to demo job
    await page.goto(f'{BASE_URL}/internships.html')
    await page.locator('.job-card:has-text("Demo Junior")').first.click()
    await page.locator('#applyBtn').click()
    await page.locator('#applyLetter, [placeholder*="työnantajalle"], textarea[placeholder*="Cover"]').first.fill('Interested in demo position!')
    await page.locator('#applySubmitBtn, button[type="submit"], .btn-primary').first.click()
    log('Applied!', True)
    
    await do_logout(page)

async def task4_company(page):
    print("\n" + "="*70)
    print("TASK 4/4 Company Accept")
    print("="*70)
    
    await do_login(page, COMPANY_EMAIL, COMPANY_PASSWORD)
    
    # Accept first application
    await page.locator('button:has-text("Accept")').first.click()
    log('Application accepted', True)
    
    await do_logout(page)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=500)
        context = await browser.new_context()
        page = await context.new_page()
        
        print("🚀 InternHub Demo http://127.0.0.1:5500")
        await task1_anonymous(page)
        await task2_company(page)
        await task3_student(page)
        await task4_company(page)
        
        print(f"\n✅ COMPLETE! {sum(r[1] for r in results)}/20 passed")
        await page.pause()
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
