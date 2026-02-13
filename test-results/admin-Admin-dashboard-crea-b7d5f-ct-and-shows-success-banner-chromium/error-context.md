# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - heading "VibeCode Snack Kiosk" [level=1] [ref=e5]
    - navigation "View selection" [ref=e7]:
      - button "Kiosk" [ref=e8] [cursor=pointer]
      - button "Admin" [active] [pressed] [ref=e9] [cursor=pointer]
  - main [ref=e10]:
    - generic [ref=e11]:
      - generic [ref=e12]:
        - heading "Admin Sign In" [level=2] [ref=e13]
        - paragraph [ref=e14]: Access the dashboard with your admin credentials.
      - generic [ref=e15]:
        - generic [ref=e16]:
          - generic [ref=e17]: Email or username
          - textbox "Email or username" [ref=e18]
        - generic [ref=e19]:
          - generic [ref=e20]: Password
          - textbox "Password" [ref=e21]
        - generic [ref=e22]:
          - checkbox "Keep me signed in on this device" [checked] [ref=e23]
          - generic [ref=e24]: Keep me signed in on this device
        - generic [ref=e25]:
          - button "Sign in" [ref=e26] [cursor=pointer]
          - button "Forgot password?" [ref=e27] [cursor=pointer]
```