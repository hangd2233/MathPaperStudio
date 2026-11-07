// Fixed app-private iOS Keychain item. No account enumeration, sharing or iCloud sync.
fn valid_token(token: &str) -> bool {
    token.len() == 43 && token.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

#[cfg(target_os = "ios")]
mod ios {
    use std::{ffi::{c_char,c_void,CString},ptr};
    type Ref = *const c_void;
    #[link(name="CoreFoundation",kind="framework")]
    extern "C" {
        fn CFStringCreateWithCString(a:Ref,s:*const c_char,e:u32)->Ref;
        fn CFDictionaryCreate(a:Ref,k:*const Ref,v:*const Ref,n:isize,kcb:Ref,vcb:Ref)->Ref;
        fn CFDataCreate(a:Ref,b:*const u8,n:isize)->Ref;
        fn CFDataGetLength(data:Ref)->isize;
        fn CFDataGetBytePtr(data:Ref)->*const u8;
        fn CFDataGetTypeID()->usize;
        fn CFGetTypeID(value:Ref)->usize;
        fn CFRelease(value:Ref);
        static kCFBooleanTrue:Ref;
        static kCFBooleanFalse:Ref;
        static kCFTypeDictionaryKeyCallBacks:u8;
        static kCFTypeDictionaryValueCallBacks:u8;
    }
    #[link(name="Security",kind="framework")]
    extern "C" {
        fn SecItemCopyMatching(query:Ref,result:*mut Ref)->i32;
        fn SecItemAdd(query:Ref,result:*mut Ref)->i32;
        fn SecItemUpdate(query:Ref,attributes:Ref)->i32;
        fn SecItemDelete(query:Ref)->i32;
        static kSecClass:Ref;
        static kSecClassGenericPassword:Ref;
        static kSecAttrService:Ref;
        static kSecAttrAccount:Ref;
        static kSecAttrAccessible:Ref;
        static kSecAttrAccessibleWhenUnlockedThisDeviceOnly:Ref;
        static kSecAttrSynchronizable:Ref;
        static kSecValueData:Ref;
        static kSecReturnData:Ref;
        static kSecMatchLimit:Ref;
        static kSecMatchLimitOne:Ref;
    }
    struct Owned(Ref);
    impl Drop for Owned {fn drop(&mut self){if !self.0.is_null(){unsafe{CFRelease(self.0)}}}}
    fn own(p:Ref)->Result<Owned,String>{if p.is_null(){Err("KEYCHAIN_UNAVAILABLE".into())}else{Ok(Owned(p))}}
    unsafe fn string(s:&str)->Result<Owned,String>{let c=CString::new(s).map_err(|_|"KEYCHAIN_UNAVAILABLE")?;own(CFStringCreateWithCString(ptr::null(),c.as_ptr(),0x08000100))}
    unsafe fn dict(pairs:&[(Ref,Ref)])->Result<Owned,String>{
        let k:Vec<Ref>=pairs.iter().map(|p|p.0).collect();let v:Vec<Ref>=pairs.iter().map(|p|p.1).collect();
        own(CFDictionaryCreate(ptr::null(),k.as_ptr(),v.as_ptr(),k.len() as isize,
            &kCFTypeDictionaryKeyCallBacks as *const u8 as Ref,&kCFTypeDictionaryValueCallBacks as *const u8 as Ref))
    }
    unsafe fn base(service:Ref,account:Ref)->Vec<(Ref,Ref)>{vec![(kSecClass,kSecClassGenericPassword),(kSecAttrService,service),(kSecAttrAccount,account),(kSecAttrSynchronizable,kCFBooleanFalse)]}
    fn error(status:i32)->String{if status == -25308 {"DEVICE_LOCKED".into()}else{"KEYCHAIN_UNAVAILABLE".into()}}
    pub fn read()->Result<Option<String>,String>{unsafe{
        let service=string("org.math-paper-studio.ipad.connection.v1")?;let account=string("paired-mps-device")?;
        let mut entries=base(service.0,account.0);entries.extend([(kSecReturnData,kCFBooleanTrue),(kSecMatchLimit,kSecMatchLimitOne)]);let query=dict(&entries)?;
        let mut result:Ref=ptr::null();let status=SecItemCopyMatching(query.0,&mut result);
        if status == -25300{return Ok(None)}if status != 0{return Err(error(status))}
        let result=own(result)?;if CFGetTypeID(result.0)!=CFDataGetTypeID(){return Err("KEYCHAIN_UNAVAILABLE".into())}
        let len=CFDataGetLength(result.0);if len!=43{return Err("KEYCHAIN_UNAVAILABLE".into())}
        let data=std::slice::from_raw_parts(CFDataGetBytePtr(result.0),len as usize);let token=std::str::from_utf8(data).map_err(|_|"KEYCHAIN_UNAVAILABLE")?.to_owned();
        if !super::valid_token(&token){return Err("KEYCHAIN_UNAVAILABLE".into())}Ok(Some(token))
    }}
    pub fn save(token:&str)->Result<(),String>{unsafe{
        let service=string("org.math-paper-studio.ipad.connection.v1")?;let account=string("paired-mps-device")?;
        let entries=base(service.0,account.0);let query=dict(&entries)?;let data=own(CFDataCreate(ptr::null(),token.as_ptr(),token.len() as isize))?;
        let attributes=[(kSecValueData,data.0),(kSecAttrAccessible,kSecAttrAccessibleWhenUnlockedThisDeviceOnly),(kSecAttrSynchronizable,kCFBooleanFalse)];let update=dict(&attributes)?;
        let status=SecItemUpdate(query.0,update.0);
        if status == -25300 {let mut all=entries;all.extend(attributes);let add=dict(&all)?;let status=SecItemAdd(add.0,ptr::null_mut());if status!=0{return Err(error(status))}}
        else if status!=0{return Err(error(status))}Ok(())
    }}
    pub fn forget()->Result<(),String>{unsafe{
        let service=string("org.math-paper-studio.ipad.connection.v1")?;let account=string("paired-mps-device")?;let query=dict(&base(service.0,account.0))?;let status=SecItemDelete(query.0);
        if status!=0 && status != -25300{return Err(error(status))}Ok(())
    }}
}
pub fn load()->Result<Option<String>,String>{
    #[cfg(target_os="ios")] {ios::read()}
    #[cfg(not(target_os="ios"))] {Err("IOS_KEYCHAIN_REQUIRED".into())}
}
pub fn save(token:&str)->Result<(),String>{
    if !valid_token(token){return Err("INVALID_DEVICE_TOKEN".into())}
    #[cfg(target_os="ios")] {ios::save(token)}
    #[cfg(not(target_os="ios"))] {Err("IOS_KEYCHAIN_REQUIRED".into())}
}
pub fn forget()->Result<(),String>{
    #[cfg(target_os="ios")] {ios::forget()}
    #[cfg(not(target_os="ios"))] {Err("IOS_KEYCHAIN_REQUIRED".into())}
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn only_existing_device_token_shape_is_accepted(){assert!(valid_token(&"a".repeat(43)));for t in ["short".to_owned(),"a".repeat(44),"!".repeat(43)]{assert!(!valid_token(&t));}}
    #[cfg(not(target_os="ios"))]
    #[test] fn desktop_cannot_touch_a_real_keychain(){assert_eq!(load().unwrap_err(),"IOS_KEYCHAIN_REQUIRED");assert_eq!(save(&"a".repeat(43)).unwrap_err(),"IOS_KEYCHAIN_REQUIRED");assert_eq!(forget().unwrap_err(),"IOS_KEYCHAIN_REQUIRED");}
}
