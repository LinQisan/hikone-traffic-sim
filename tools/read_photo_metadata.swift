// Optional macOS survey helper: swift tools/read_photo_metadata.swift 10.29 /tmp/photo-metadata
// Uses ImageIO only. Originals remain unchanged; model building never invokes this tool.
import Foundation
import ImageIO
let dir=URL(fileURLWithPath:CommandLine.arguments[1]);let out=URL(fileURLWithPath:CommandLine.arguments[2]);try! FileManager.default.createDirectory(at:out,withIntermediateDirectories:true)
let urls=try! FileManager.default.contentsOfDirectory(at:dir,includingPropertiesForKeys:nil).filter{["heic","jpg","jpeg","png"].contains($0.pathExtension.lowercased())}.sorted{$0.lastPathComponent<$1.lastPathComponent}
var records=[[String:Any]]()
for url in urls {
 guard let src=CGImageSourceCreateWithURL(url as CFURL,nil),let p=CGImageSourceCopyPropertiesAtIndex(src,0,nil) as? [String:Any] else {continue}
 var r:[String:Any] = ["file":dir.lastPathComponent+"/"+url.lastPathComponent,"width":p["PixelWidth"] ?? 0,"height":p["PixelHeight"] ?? 0]
 if let gps=p["{GPS}"] {r["gps"]=gps};if let ex=p["{Exif}"] as? [String:Any]{r["capturedLocal"]=ex["DateTimeOriginal"] ?? "";r["focalLength35mm"]=ex["FocalLenIn35mmFilm"] ?? 0}
 records.append(r)

}
let data=try! JSONSerialization.data(withJSONObject:records,options:[.prettyPrinted,.sortedKeys]);try! data.write(to:out.appendingPathComponent("metadata.json"));print("Inspected \(records.count) image files")
