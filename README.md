# 📦 BH Summary Maker

A beautiful, modern web application for managing product lots, items, and users with role-based access control.

![Status](https://img.shields.io/badge/status-production%20ready-brightgreen)
![Version](https://img.shields.io/badge/version-1.0.0-blue)

---

## ✨ Features

### 🔐 Authentication
- Number + Password login
- Role-based access (Admin, Manager, Viewer)
- Session management

### 📊 Lot Management
- Create, edit, and delete lots
- Set lot status (Going on, Yet to arrive, Arrived)
- View lots with filters
- Generate PNG screenshots

### 📦 Item Management
- Add items with images (Cloudinary)
- Edit item prices
- Pass items to other users
- Cancel/restore items
- Delete items
- Automatic image optimization

### 👥 User Management
- Admin panel for user CRUD
- Multiple access levels
- User-specific delivery & payment status
- Profile views with filtering

### 🎨 Beautiful UI
- Glassmorphism design (login, dashboard, admin)
- Clean white design (lot view, person view)
- Responsive layout
- Modern animations
- Custom backgrounds

---

## 🚀 Quick Start

### Prerequisites
- Supabase account (free)
- Cloudinary account (free)

### Setup

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd bh_smry_maker
```

2. **Configure Supabase**
   - Update `js/supabase-config.js` with your credentials

3. **Configure Cloudinary**
   - Update `js/lot_view.js` with your cloud name and upload preset

4. **Setup Database**
   - Run `database_setup.sql` in Supabase SQL Editor

5. **Deploy**
   - See `READY_TO_DEPLOY.md` for deployment guide

---

## 🗂️ Project Structure

```
bh_smry_maker/
├── index.html              # Login page
├── dashboard.html          # Main dashboard
├── lot_view.html          # Lot management
├── person_view.html       # User profile view
├── admin_panel.html       # User management
├── css/                   # Stylesheets
├── js/                    # JavaScript logic
└── database_setup.sql     # Database initialization
```

---

## 🎨 Design

### Pages with Glassmorphism:
- **Login** - Japan digital art background
- **Dashboard** - Anime water character background
- **Admin Panel** - Anime water character background

### Pages with Clean Design:
- **Lot View** - Solid white, optimized for item management
- **Person View** - Solid white, optimized for user viewing

---

## 🔧 Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Cloudinary (Images)
- **Fonts**: Poppins (Google Fonts)
- **Libraries**: 
  - Supabase JS Client
  - html2canvas (PNG generation)

---

## 👥 User Roles

### Admin
- Full access to all features
- User management
- Lot management
- Item management

### Manager
- Lot management
- Item management
- View all users
- Cannot manage users

### Viewer
- View lots (except "Going on")
- View own items
- View delivery & payment status
- Read-only access

---

## 📱 Features by Page

### Login
- Number + password authentication
- Beautiful glassmorphism UI
- Japan-themed background

### Dashboard
- View all lots
- Create new lots
- Edit/delete lots
- Set lot status
- Beautiful anime background

### Lot View
- View lot items grouped by user
- Add new items
- Edit prices
- Pass items to other users
- Cancel/restore items
- Show/hide totals
- Generate PNG screenshots
- Clean white interface

### Person View
- View user's items across all lots
- Filter by delivery status
- Filter by payment status
- Update statuses (admin/manager)
- Generate PNG screenshots
- Clean white interface

### Admin Panel
- Add new users
- Edit users (username, number, password, access level)
- Delete users
- View user statistics
- Beautiful anime background

---

## 🔒 Security

- Session-based authentication
- Role-based access control
- Client-side validation
- Supabase Row Level Security (RLS)

**Note**: For production, consider:
- Password hashing (bcrypt)
- Rate limiting
- HTTPS (provided by Vercel)

---

## 📦 Deployment

Deploy to Vercel in 3 steps:

1. Run `database_setup.sql` in Supabase
2. Drag & drop folder to Vercel
3. Done! ✅

See `READY_TO_DEPLOY.md` for detailed instructions.

---

## 📄 License

This project is proprietary software.

---

## 🙏 Credits

- UI Design: Custom glassmorphism theme
- Images: Cloudinary
- Database: Supabase
- Fonts: Google Fonts (Poppins)

---

## 📞 Support

For issues or questions:
1. Check browser console (F12)
2. Verify Supabase configuration
3. Review `READY_TO_DEPLOY.md`

---

**Built with ❤️ for efficient lot and item management**
