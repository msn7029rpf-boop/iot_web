# 🚀 คู่มือการ Deploy เว็บไซต์ระบบรายงานสภาพแวดล้อม IoT (IoT Environment Dashboard)

คู่มือฉบับนี้อธิบายขั้นตอนการนำโปรเจกต์ขึ้นระบบออนไลน์ (Production Deployment) เพื่อให้ทุกคนสามารถเข้าดูแดชบอร์ดอุณหภูมิและความชื้นแบบเรียลไทม์ได้จากทั่วโลก

---

## 🌟 แนวทางที่ง่ายที่สุดและแนะนำมากที่สุด: Render.com + GitHub

เนื่องจากโปรเจกต์นี้มี **Node.js Express Backend** สำหรับจำลองและรับข้อมูลจากเซนเซอร์ IoT พร้อมให้บริการ Frontend ในตัว การฝากเว็บไว้บน **Render.com (Free Tier)** ร่วมกับ **GitHub** จึงเป็นวิธีที่ สะดวก ฟรี และง่ายที่สุด

---

## 🛠️ ขั้นตอนที่ 1: นำโค้ดขึ้น GitHub (Upload to GitHub)

1. สมัครหรือเข้าใช้งานที่ [GitHub.com](https://github.com)
2. สร้าง Repository ใหม่ ตั้งชื่อเช่น `iot-environment-dashboard` (ตั้งค่าเป็น **Public**)
3. เปิด Terminal ในเครื่องคอมพิวเตอร์ของคุณ แล้วรันคำสั่ง:

```bash
git add .
git commit -m "Prepare repository for deployment"
git remote add origin https://github.com/USERNAME/iot-environment-dashboard.git
git branch -M main
git push -u origin main
```
*(เปลี่ยน `USERNAME` เป็นชื่อผู้ใช้ GitHub ของคุณ)*

---

## ☁️ ขั้นตอนที่ 2: Deploy ขึ้น Render.com

1. สมัคร/เข้าสู่ระบบที่ [Render.com](https://render.com) (เข้าด้วยบัญชี GitHub ได้ทันที)
2. คลิกปุ่ม **"New +"** แล้วเลือก **"Web Service"**
3. เลือก **"Build and deploy from a Git repository"** แล้วกด **Next**
4. เลือก Repository `iot-environment-dashboard` ที่เพิ่งอัปโหลด
5. กรอกรายละเอียดการตั้งค่าดังนี้:
   - **Name:** `iot-environment-dashboard` *(หรือชื่อที่คุณต้องการ)*
   - **Region:** `Singapore` *(เพื่อความเร็วในการเข้าถึงจากประเทศไทย)*
   - **Branch:** `main`
   - **Root Directory:** *(เว้นว่างไว้)*
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
6. กดปุ่ม **"Create Web Service"**
7. รอ Render ดำเนินการ Build ประมาณ 1-2 นาที เมื่อเสร็จสิ้น คุณจะได้รับ URL สำหรับเข้าใช้งานทันที เช่น:
   `https://iot-environment-dashboard.onrender.com`

---

## ⚠️ ข้อควรระวังและคำแนะนำเพิ่มเติม (Precautions & Tips)

1. **การ Sleep ของ Render Free Tier:**
   - ในแผนการใช้งานฟรี Render จะพักการทำงาน (Sleep) ของเว็บอัตโนมัติหากไม่มีคนเข้าชมนานเกิน 15 นาที
   - เมื่อมีผู้เข้าชมคนใหม่ เว็บจะใช้เวลาเปิด (Wake up) ประมาณ 30–50 วินาทีในคำขอแรก ซึ่งเป็นเรื่องปกติของ Free Hosting
2. **การเชื่อมต่อกับกล่องเซนเซอร์จริง (ESP32 / ESP8266 / Arduino):**
   - สามารถส่งข้อมูล Telemetry จากไมโครคอนโทรลเลอร์ผ่าน HTTP POST มาที่:
     `POST https://<your-render-url>.onrender.com/api/environment/telemetry`
   - Payload JSON: `{"temperature": 32.5, "humidity": 65.0}`
3. **โครงสร้างโค้ดที่เตรียมไว้พร้อม Deploy:**
   - โครงสร้างโปรเจกต์มี `package.json` และ `render.yaml` ที่รากโฟลเดอร์เรียบร้อยแล้ว
   - Backend Express รองรับพอร์ต dynamic จากระบบคลาวด์ (`process.env.PORT`)
   - Frontend เรียก API ผ่าน `window.location.origin` อัตโนมัติ จึงใช้งานได้ทันทีโดยไม่ต้องแก้ไข IP หรือ Domain ในโค้ด
