# 🎯 BH Summary Maker

A modern, web-based collection management system for managing product lots, items, and users.

## 🚀 Features

- ✅ **User Management** - Admin panel with role-based access (Admin, Manager, Viewer)
- ✅ **Lot Management** - Create and manage multiple product lots
- ✅ **Item Tracking** - Add items with images, prices, and user assignment
- ✅ **Status Tracking** - Delivery status and payment tracking per user
- ✅ **Image Management** - Paste images directly, auto-upload to Cloudinary
- ✅ **PNG Export** - Generate shareable summaries
- ✅ **Mobile Friendly** - Responsive design works on all devices

## 📋 Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Database**: Supabase (PostgreSQL)
- **Image Storage**: Cloudinary
- **Hosting**: Vercel (recommended)

## 🎨 Design

- **Font**: Poppins
- **Color Scheme**: Blue (#092241) and Light Blue (#06b0ef)
- **Theme**: Professional, clean, modern UI

## 📁 Project Structure

```
bh_smry_maker/
├── index.html              # Login page (homepage)
├── dashboard.html          # Lots dashboard
├── lot_view.html          # Individual lot view
├── person_view.html       # User profile view
├── admin_panel.html       # User management
├── css/                   # All stylesheets
│   ├── common.css         # Shared styles
│   ├── login.css
│   ├── dashboard.css
│   ├── lot_view.css
│   ├── person_view.css
│   └── admin_panel.css
└── js/                    # All JavaScript
    ├── supabase-config.js  # Database configuration
    ├── login.js
    ├── dashboard.js
    ├── lot_view.js
    ├── person_view.js
    └── admin_panel.js
```

## 🚀 Deployment

**Quick Start:**
1. Read `QUICK_DEPLOY.txt` for a fast overview
2. Follow `DEPLOYMENT_GUIDE.md` for detailed instructions
3. Deploy to Vercel (drag & drop your folder)
4. Connect your GoDaddy domain
5. Update Supabase redirect URLs

**Total Cost:** $0/month (just your domain cost)

## 🔐 Security

- Row Level Security (RLS) enabled on Supabase
- Role-based access control (RBAC)
- Secure authentication
- HTTPS enforced

## 📱 Key Workflows

### Adding Items (Fast Method):
1. Paste image anywhere on lot page
2. Modal opens automatically
3. Fill username & price
4. Press Enter or click Add
5. Repeat (modal stays open)

### Managing Users:
1. Admin Panel → Add users
2. Set roles (Admin/Manager/Viewer)
3. Set passwords
4. Users can login and manage lots

### Tracking Status:
- **Lot Status**: Going on → Yet to arrive → Arrived
- **User Delivery**: Yet to arrive → Arrived → Delivered
- **Payment**: Unpaid → Paid

## 🎯 User Roles

- **Admin**: Full access - manage everything
- **Manager**: Manage lots and items
- **Viewer**: View-only access to their own items

## 📞 Support

For deployment help, check the deployment guides.
For feature requests or bugs, contact the developer.

## 📄 License

Private use only.

---

**Built with ❤️ for efficient collection management**
